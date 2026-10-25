import { schema } from "@fluently/db";
import { and, eq, gte, ne, or, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Deps } from "./app";
import { streakReminderEmail } from "./mailer";
import { localDay, progress } from "./progress";

const { user, lesson } = schema;
// Reminders start once 6 hours are left in the Learner's local day.
const FROM_HOUR = 18;

const localHour = (d: Date, timeZone: string) =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "numeric", hourCycle: "h23" }).format(d));

const unsubscribeToken = (secret: string, userId: string) =>
  createHmac("sha256", secret).update(`streak-reminders:${userId}`).digest("base64url");

export const unsubscribeUrl = (env: Deps["env"], userId: string) =>
  `${new URL("/api/email/unsubscribe", env.WEB_ORIGIN).href}?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(env.BETTER_AUTH_SECRET, userId)}`;

/** Emails each Learner whose Streak is alive but not yet extended today, once, in the last 6 hours of their day. */
export async function sendStreakReminders(deps: Deps) {
  const { db, mailer, env } = deps;
  const at = deps.now();
  // Only Learners with a Lesson in the last two days can have a Streak that ends today.
  const learners = await db
    .selectDistinct({ id: user.id, email: user.email, timezone: user.timezone, remindedOn: user.streakRemindedOn })
    .from(user)
    .innerJoin(lesson, eq(lesson.userId, user.id))
    .where(
      and(
        eq(user.streakReminders, true),
        eq(user.emailVerified, true),
        eq(lesson.status, "completed"),
        gte(lesson.completedAt, new Date(at.getTime() - 50 * 3_600_000)),
      ),
    );
  for (const learner of learners) {
    const today = localDay(at, learner.timezone);
    const hour = localHour(at, learner.timezone);
    if (learner.remindedOn === today || hour < FROM_HOUR) continue;
    const { streak, week } = await progress(db, learner, at);
    if (streak === 0 || week.some((d) => d.today && d.practised)) continue;
    // Claim today's reminder first so overlapping sweeps send it once; a failed send releases it for the next sweep.
    const [claimed] = await db
      .update(user)
      .set({ streakRemindedOn: today })
      .where(and(eq(user.id, learner.id), or(isNull(user.streakRemindedOn), ne(user.streakRemindedOn, today))))
      .returning({ id: user.id });
    if (!claimed) continue;
    try {
      await mailer.send(
        streakReminderEmail(
          learner.email,
          { streak, hoursLeft: 24 - hour, week },
          env.WEB_ORIGIN,
          unsubscribeUrl(env, learner.id),
        ),
        `streak-reminder/${learner.id}/${today}`,
      );
    } catch (error) {
      await db.update(user).set({ streakRemindedOn: learner.remindedOn }).where(eq(user.id, learner.id));
      console.error("Streak reminder failed", error);
    }
  }
}

export function startStreakReminders(deps: Deps) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sendStreakReminders(deps);
    } catch (error) {
      console.error("Streak reminders failed", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 5 * 60_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

const page = (message: string, form = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Streak reminders</title></head><body style="margin:0;background:#f5f5f4;color:#0e0e0f;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.6"><main style="max-width:480px;margin:48px auto;padding:24px;background:#ffffff;border:1px solid #e4e3df;border-radius:16px"><p style="margin:0 0 16px">${message}</p>${form}</main></body></html>`;

// No session needed: the signed link identifies the Learner. GET asks first, since link scanners open links.
// POST turns reminders off; mail apps' one-click unsubscribe (RFC 8058) posts here directly.
export const unsubscribeRoute = ({ db, env }: Pick<Deps, "db" | "env">) =>
  new Hono()
    .get("/", (c) => {
      const { u = "", t = "" } = c.req.query();
      return c.html(
        page(
          "Stop the emails that remind you to keep your Streak?",
          `<form method="post" action="?u=${encodeURIComponent(u)}&amp;t=${encodeURIComponent(t)}"><button style="font:inherit;font-weight:bold;background:#2f3bd6;color:#ffffff;border:0;border-radius:999px;padding:12px 22px;cursor:pointer">Stop Streak reminders</button></form>`,
        ),
      );
    })
    .post("/", async (c) => {
      const { u = "", t = "" } = c.req.query();
      const expected = Buffer.from(unsubscribeToken(env.BETTER_AUTH_SECRET, u));
      const given = Buffer.from(t);
      if (!u || given.length !== expected.length || !timingSafeEqual(given, expected))
        return c.html(page("This link isn't valid. Open the latest Streak reminder and try its link again."), 400);
      await db.update(user).set({ streakReminders: false }).where(eq(user.id, u));
      return c.html(page("Done. You won't get Streak reminders any more."));
    });
