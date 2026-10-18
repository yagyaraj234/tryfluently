import { describe, expect, spyOn, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { cookieFrom, fakeMailer, fakeRealtime, json, makeApp, signUp, uniqueEmail, WEB_ORIGIN } from "./helpers";
import { testDb } from "./setup";
import { schema } from "@impromptu/db";

describe("auth", () => {
  test("deleting an account ends its live voice call before cascading its data", async () => {
    const realtime = fakeRealtime();
    const app = makeApp({ realtime });
    const { cookie } = await signUp(app);
    const assessment = await app.request("/api/assessments", json({ mode: "voice" }, cookie));
    const { id } = await assessment.json() as { id: string };
    expect((await app.request(`/api/assessments/${id}/call`, { method: "POST", headers: { cookie, origin: WEB_ORIGIN }, body: "v=0" })).status).toBe(201);
    expect((await app.request("/api/auth/delete-user", json({ password: "correct-horse-battery" }, cookie))).status).toBe(200);
    expect(realtime.sideband().hungUp).toBe(true);
  });
  test("Google sign-up records the browser timezone, preserves it on later sign-ins, and supports deletion without a password", async () => {
    const app = makeApp({ env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" } });
    const profile = { sub: crypto.randomUUID(), email: uniqueEmail(), email_verified: true, name: "Asha" };
    const jwt = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify(profile))}.signature`;
    const provider = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (input: URL | RequestInfo) => {
      if (!String(input).includes("oauth2.googleapis.com/token")) throw new Error(`Unexpected provider request: ${input}`);
      return Response.json({ access_token: "fake-access", token_type: "Bearer", expires_in: 3600, id_token: jwt });
    }, { preconnect: fetch.preconnect }));
    try {
      async function google(timezone: string) {
        const start = await app.request("/api/auth/sign-in/social", json({ provider: "google", callbackURL: "/", additionalData: { timezone } }));
        expect(start.status).toBe(200);
        const { url } = await start.json() as { url: string };
        const callback = await app.request(`/api/auth/callback/google?code=fake&state=${new URL(url).searchParams.get("state")}`, { headers: { cookie: cookieFrom(start) } });
        return callback;
      }
      const invalid = await google("Mars/Olympus");
      expect(invalid.status).toBe(400);
      expect((await app.request("/api/me", { headers: { cookie: cookieFrom(invalid) } })).status).toBe(401);
      const signedIn = await google("Asia/Kolkata");
      expect(signedIn.status).toBe(302);
      const cookie = cookieFrom(signedIn);
      const me = await (await app.request("/api/me", { headers: { cookie } })).json() as { id: string; timezone: string };
      expect(me.timezone).toBe("Asia/Kolkata");
      const later = cookieFrom(await google("America/New_York"));
      expect(await (await app.request("/api/me", { headers: { cookie: later } })).json()).toMatchObject({ timezone: "Asia/Kolkata" });

      await testDb.update(schema.session).set({ createdAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(schema.session.userId, me.id));
      const stale = await app.request("/api/auth/delete-user", json({}, later));
      expect(stale.status).toBe(400);
      expect(await stale.json()).toMatchObject({ code: "SESSION_EXPIRED" });
      const fresh = cookieFrom(await google("Asia/Kolkata"));
      expect((await app.request("/api/auth/delete-user", json({}, fresh))).status).toBe(200);
      expect((await app.request("/api/me", { headers: { cookie: fresh } })).status).toBe(401);
    } finally {
      provider.mockRestore();
    }
  });
  test("a Learner must verify their email before they can sign in", async () => {
    const mailer = fakeMailer();
    const app = makeApp({ mailer });
    const email = uniqueEmail();
    const password = "correct-horse-battery";

    const signUp = await app.request("/api/auth/sign-up/email", json({ name: "Asha", email, password }));
    expect(signUp.status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: email, subject: "Verify your Impromptu email" });
    expect((await app.request("/api/me", { headers: { cookie: cookieFrom(signUp) } })).status).not.toBe(200);

    const signIn = await app.request("/api/auth/sign-in/email", json({ email, password }));
    expect(signIn.status).toBe(403);

    const url = new URL(mailer.sent[0]!.text!.match(/https?:\S+/)![0]!);
    const verified = await app.request(url.pathname + url.search);
    expect(verified.status).toBe(302);

    const me = await app.request("/api/me", { headers: { cookie: cookieFrom(verified) } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email, name: "Asha" });
  });

  test("the Learner's timezone is stored at sign-up", async () => {
    const app = makeApp();
    const { cookie } = await signUp(app, { name: "Ravi", timezone: "Asia/Kolkata" });
    const me = await app.request("/api/me", { headers: { cookie } });
    expect(await me.json()).toMatchObject({ timezone: "Asia/Kolkata" });
  });

  test("sign-up with a timezone that isn't a real IANA zone is rejected", async () => {
    const res = await makeApp().request(
      "/api/auth/sign-up/email",
      json({ name: "Ravi", email: uniqueEmail(), password: "correct-horse-battery", timezone: "Mars/Olympus" }),
    );
    expect(res.status).toBe(400);
  });

  test("the sign-in page learns whether Google is offered, without a session", async () => {
    const providers = async (app: ReturnType<typeof makeApp>) => (await app.request("/api/auth/providers")).json();
    expect(await providers(makeApp())).toEqual({ google: false });
    expect(await providers(makeApp({ env: { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" } }))).toEqual({ google: true });
  });

  test("app routes return 401 without a session", async () => {
    const res = await makeApp().request("/api/me");
    expect(res.status).toBe(401);
  });

  test("a Learner can delete their account and no rows remain for them in any table", async () => {
    const app = makeApp();
    const password = "correct-horse-battery";
    const { cookie } = await signUp(app, { name: "Mei", password });
    const { id } = (await (await app.request("/api/me", { headers: { cookie } })).json()) as { id: string };

    const del = await app.request("/api/auth/delete-user", json({ password }, cookie));
    expect(del.status).toBe(200);

    // Side-channel check agreed for this ticket: every table holding a user_id must cascade from user.
    const tables = await testDb.execute<{ table_name: string }>(
      sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'user_id'`,
    );
    expect(tables.length).toBeGreaterThan(0);
    for (const { table_name } of tables) {
      const [row] = await testDb.execute<{ n: number }>(
        sql`select count(*)::int as n from ${sql.identifier(table_name)} where user_id = ${id}`,
      );
      expect({ table_name, n: row!.n }).toEqual({ table_name, n: 0 });
    }
    const [user] = await testDb.execute<{ n: number }>(sql`select count(*)::int as n from "user" where id = ${id}`);
    expect(user!.n).toBe(0);
  });
});
