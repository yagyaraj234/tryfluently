import { schema, type Db } from "@fluently/db";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "./app";

const { lesson, step } = schema;

// The local calendar day, as YYYY-MM-DD.
export const localDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);
const dayBefore = (day: string) => addDays(day, -1);

// XP and Streak are worked out from Steps and Lessons every time, never stored.
export async function progress(db: Db, user: { id: string; timezone: string }, now: Date) {
  const [[answered], lessons, units] = await Promise.all([
    db
      .select({ n: count() })
      .from(step)
      .where(and(eq(step.userId, user.id), isNotNull(step.answeredAt))),
    db
      .select({ at: lesson.completedAt, unitId: lesson.unitId, position: lesson.position, status: lesson.status })
      .from(lesson)
      .where(eq(lesson.userId, user.id)),
    db.select().from(schema.unit).where(eq(schema.unit.userId, user.id)),
  ]);

  const completed = lessons.filter((l) => l.status === "completed");
  // Consecutive local days with a completed Lesson, ending today, or yesterday while today isn't over.
  const days = new Set(completed.map((l) => localDay(l.at!, user.timezone)));
  const today = localDay(now, user.timezone);
  let day = days.has(today) ? today : dayBefore(today);
  let streak = 0;
  for (; days.has(day); day = dayBefore(day)) streak++;

  // This week, Monday to Sunday.
  const monday = addDays(today, -((new Date(today).getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => ({
    day: d,
    practised: days.has(d),
    today: d === today,
  }));

  const roadmapLessons = completed.filter((l) => l.unitId);
  const learning = {
    completedLessons: roadmapLessons.length,
    plannedLessons: units.reduce(
      (sum, u) =>
        sum +
        new Set([
          ...u.lessonOutline.map((p) => p.position),
          ...lessons.filter((l) => l.unitId === u.id && l.status !== "abandoned").map((l) => l.position),
        ]).size,
      0,
    ),
    completedUnits: units.filter((u) => u.status === "mastered").length,
    totalUnits: units.length,
    lessonsThisWeek: completed.filter((l) => {
      const day = localDay(l.at!, user.timezone);
      return day >= monday && day <= today;
    }).length,
  };
  return { xp: 10 * answered!.n + 20 * completed.length, streak, week, learning };
}

export const progressRoute = (deps: Pick<Deps, "db" | "now">) =>
  new Hono<AppEnv>().get("/", async (c) => c.json(await progress(deps.db, c.var.user, deps.now())));
