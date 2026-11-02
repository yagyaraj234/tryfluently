import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { cookieFrom, fakeMailer, json, makeApp, makeClock, uniqueEmail } from "./helpers";
import { testDb } from "./setup";

const reminders = (mailer: ReturnType<typeof fakeMailer>, email: string) =>
  mailer.sent.filter((m) => m.to === email && m.subject?.includes("Verify your email to start"));

describe("verify reminders", () => {
  test("an unverified Learner gets one reminder 24 hours after signing up", async () => {
    const mailer = fakeMailer();
    const clock = makeClock();
    const app = makeApp({ mailer, now: clock });
    const email = uniqueEmail();
    await app.request("/api/auth/sign-up/email", json({ name: "Asha", email, password: "correct-horse-battery" }));
    await testDb.update(schema.user).set({ createdAt: clock() }).where(eq(schema.user.email, email));

    clock.advance({ minutes: 23 * 60 });
    await app.remindUnverified();
    expect(reminders(mailer, email)).toHaveLength(0);

    clock.advance({ minutes: 2 * 60 });
    await app.remindUnverified();
    await app.remindUnverified();
    const [mail] = reminders(mailer, email);
    expect(reminders(mailer, email)).toHaveLength(1);

    // The link in the email really verifies the account.
    const url = new URL(mail!.text!.match(/https?:\S+/)![0]!);
    const verify = await app.request(url.pathname + url.search, { redirect: "manual" });
    expect(verify.status).toBeLessThan(400);
    const signIn = await app.request("/api/auth/sign-in/email", json({ email, password: "correct-horse-battery" }));
    expect(signIn.status).toBe(200);
    expect(cookieFrom(signIn)).toBeTruthy();
  });

  test("the footer unsubscribes from verification reminders with a signed POST, without changing Streak reminders", async () => {
    const mailer = fakeMailer();
    const clock = makeClock();
    const app = makeApp({ mailer, now: clock });
    const email = uniqueEmail();
    await app.request("/api/auth/sign-up/email", json({ name: "Asha", email, password: "correct-horse-battery" }));
    await testDb.update(schema.user).set({ createdAt: clock() }).where(eq(schema.user.email, email));
    clock.advance({ days: 1 });
    await app.remindUnverified();

    const [mail] = reminders(mailer, email);
    const link = new URL(mail!.headers!["List-Unsubscribe"]!.slice(1, -1));
    const path = link.pathname + link.search;
    expect(mail!.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(mail!.text).toContain(`Unsubscribe from verification reminders: ${link.href}`);
    expect(mail!.html).toContain(`href="${link.href.replaceAll("&", "&#38;")}"`);
    expect(mail!.html).toContain(">Unsubscribe from verification reminders</a>");

    expect((await app.request(path)).status).toBe(200);
    expect((await app.request(path.replace(/t=[^&]+/, "t=forged"), { method: "POST" })).status).toBe(400);
    expect(
      (await app.request(path.replace("unsubscribe-verification", "unsubscribe"), { method: "POST" })).status,
    ).toBe(400);
    const [before] = await testDb.select().from(schema.user).where(eq(schema.user.email, email));
    expect(before!.verifyReminders).toBe(true);

    expect((await app.request(path, { method: "POST" })).status).toBe(200);
    expect((await app.request(path, { method: "POST" })).status).toBe(200);
    const [after] = await testDb.select().from(schema.user).where(eq(schema.user.email, email));
    expect(after!.verifyReminders).toBe(false);
    expect(after!.streakReminders).toBe(true);
    expect(after!.emailVerified).toBe(false);

    await testDb.update(schema.user).set({ verifyRemindedAt: null }).where(eq(schema.user.email, email));
    await app.remindUnverified();
    expect(reminders(mailer, email)).toHaveLength(1);
  });
});
