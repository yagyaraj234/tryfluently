import { schema, type Db } from "@impromptu/db";
import { and, count, eq, isNotNull } from "drizzle-orm";

const { lesson, step } = schema;

// The local calendar day, as YYYY-MM-DD.
const localDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
const dayBefore = (day: string) => new Date(Date.parse(day) - 86_400_000).toISOString().slice(0, 10);

// XP and Streak are worked out from Steps and Lessons every time, never stored.
export async function progress(db: Db, user: { id: string; timezone: string }, now: Date) {
  const [[answered], completed] = await Promise.all([
    db
      .select({ n: count() })
      .from(step)
      .where(and(eq(step.userId, user.id), isNotNull(step.answeredAt))),
    db
      .select({ at: lesson.completedAt })
      .from(lesson)
      .where(and(eq(lesson.userId, user.id), eq(lesson.status, "completed"))),
  ]);

  // Consecutive local days with a completed Lesson, ending today, or yesterday while today isn't over.
  const days = new Set(completed.map((l) => localDay(l.at!, user.timezone)));
  let day = localDay(now, user.timezone);
  if (!days.has(day)) day = dayBefore(day);
  let streak = 0;
  for (; days.has(day); day = dayBefore(day)) streak++;

  return { xp: 10 * answered!.n + 20 * completed.length, streak };
}
