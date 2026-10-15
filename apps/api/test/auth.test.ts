import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { cookieFrom, json, makeApp, uniqueEmail } from "./helpers";
import { testDb } from "./setup";

describe("auth", () => {
  test("a Learner signs up, signs in, and the session cookie authenticates later requests", async () => {
    const app = makeApp();
    const email = uniqueEmail();
    const password = "correct-horse-battery";

    const signUp = await app.request("/api/auth/sign-up/email", json({ name: "Asha", email, password }));
    expect(signUp.status).toBe(200);

    const signIn = await app.request("/api/auth/sign-in/email", json({ email, password }));
    expect(signIn.status).toBe(200);

    const me = await app.request("/api/me", { headers: { cookie: cookieFrom(signIn) } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ email, name: "Asha" });
  });

  test("the Learner's timezone is stored at sign-up", async () => {
    const app = makeApp();
    const signUp = await app.request(
      "/api/auth/sign-up/email",
      json({ name: "Ravi", email: uniqueEmail(), password: "correct-horse-battery", timezone: "Asia/Kolkata" }),
    );

    const me = await app.request("/api/me", { headers: { cookie: cookieFrom(signUp) } });
    expect(await me.json()).toMatchObject({ timezone: "Asia/Kolkata" });
  });

  test("sign-up with a timezone that isn't a real IANA zone is rejected", async () => {
    const res = await makeApp().request(
      "/api/auth/sign-up/email",
      json({ name: "Ravi", email: uniqueEmail(), password: "correct-horse-battery", timezone: "Mars/Olympus" }),
    );
    expect(res.status).toBe(400);
  });

  test("app routes return 401 without a session", async () => {
    const res = await makeApp().request("/api/me");
    expect(res.status).toBe(401);
  });

  test("a Learner can delete their account and no rows remain for them in any table", async () => {
    const app = makeApp();
    const password = "correct-horse-battery";
    const signUp = await app.request("/api/auth/sign-up/email", json({ name: "Mei", email: uniqueEmail(), password }));
    const cookie = cookieFrom(signUp);
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
