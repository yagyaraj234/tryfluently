import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { fakeMailer, makeApp, makeClock, signUp, type TestApp } from "./helpers";
import { testDb } from "./setup";

// A Learner in Kolkata (UTC+5:30) with Lessons completed at the given UTC times.
async function learner(app: TestApp, ...completedAt: string[]) {
  const { id } = await signUp(app, { timezone: "Asia/Kolkata" });
  for (const [i, at] of completedAt.entries())
    await testDb.insert(schema.lesson).values({
      userId: id,
      position: i,
      kind: "practice",
      title: "Talking about your week",
      objective: "Describe what you did this week.",
      status: "completed",
      completedAt: new Date(at),
    });
  const [row] = await testDb.select({ email: schema.user.email }).from(schema.user).where(eq(schema.user.id, id));
  return { id, email: row!.email };
}

// 23 and 24 Oct, mid-morning in Kolkata.
const twoDays = ["2026-10-23T05:00:00Z", "2026-10-24T05:00:00Z"];
// Streak reminders sent to `email`; sign-up's verification email doesn't count.
const sentTo = (mailer: ReturnType<typeof fakeMailer>, email: string) =>
  mailer.sent.filter((m) => m.to === email && m.subject.includes("Streak"));

describe("Streak reminders", () => {
  test("a Learner whose Streak is alive gets one reminder once 6 hours are left in their day", async () => {
    const clock = makeClock("2026-10-25T12:00:00Z"); // 17:30 in Kolkata
    const mailer = fakeMailer();
    const app = makeApp({ now: clock, mailer });
    const { email } = await learner(app, ...twoDays);

    await app.remindStreaks();
    expect(sentTo(mailer, email)).toHaveLength(0);

    clock.set("2026-10-25T12:30:00Z"); // 18:00 in Kolkata
    await app.remindStreaks();
    clock.set("2026-10-25T14:30:00Z");
    await app.remindStreaks();

    const [mail, ...rest] = sentTo(mailer, email);
    expect(rest).toHaveLength(0);
    expect(mail!.subject).toBe("6 hours left to keep your 2-day Streak");
    expect(mail!.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    // No Lesson on the 25th, so by the next evening the Streak is gone and there's nothing to remind about.
    clock.set("2026-10-26T12:30:00Z");
    await app.remindStreaks();
    expect(sentTo(mailer, email)).toHaveLength(1);
  });

  test("no reminder without a Streak, or once today's Lesson is done", async () => {
    const clock = makeClock("2026-10-25T13:00:00Z"); // 18:30 in Kolkata
    const mailer = fakeMailer();
    const app = makeApp({ now: clock, mailer });
    const lapsed = await learner(app, "2026-10-23T05:00:00Z"); // last Lesson two days ago
    const done = await learner(app, ...twoDays, "2026-10-25T06:00:00Z");

    await app.remindStreaks();
    expect(sentTo(mailer, lapsed.email)).toHaveLength(0);
    expect(sentTo(mailer, done.email)).toHaveLength(0);
  });

  test("the email's link turns reminders off, and only with a valid signature", async () => {
    const clock = makeClock("2026-10-25T13:00:00Z");
    const mailer = fakeMailer();
    const app = makeApp({ now: clock, mailer });
    const { id, email } = await learner(app, ...twoDays);
    await app.remindStreaks();
    const link = new URL(sentTo(mailer, email)[0]!.headers!["List-Unsubscribe"]!.slice(1, -1));
    const path = link.pathname + link.search;

    expect((await app.request(path)).status).toBe(200); // GET only asks
    expect((await app.request(path.replace(/t=[^&]+/, "t=forged"), { method: "POST" })).status).toBe(400);
    expect((await app.request(path, { method: "POST" })).status).toBe(200);
    const [row] = await testDb.select().from(schema.user).where(eq(schema.user.id, id));
    expect(row!.streakReminders).toBe(false);

    // Forget today's reminder: it would go out again, but the Learner opted out.
    await testDb.update(schema.user).set({ streakRemindedOn: null }).where(eq(schema.user.id, id));
    await app.remindStreaks();
    expect(sentTo(mailer, email)).toHaveLength(1);
  });
});
