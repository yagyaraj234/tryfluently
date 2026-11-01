import { schema, type Tx } from "@fluently/db";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "./app";
import { billingError } from "./billing-errors";
import { requirePro, restorationPeriod } from "./billing-credits";

const { lesson, step } = schema;

// The local calendar day, as YYYY-MM-DD.
export const localDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);
const dayBefore = (day: string) => addDays(day, -1);

// XP and Streak are worked out from Steps and Lessons every time, never stored.
export async function progress(db: Tx, user: { id: string; timezone: string }, now: Date) {
  const [[answered], lessons, units, restorations] = await Promise.all([
    db
      .select({ n: count() })
      .from(step)
      .where(and(eq(step.userId, user.id), isNotNull(step.answeredAt))),
    db
      .select({ at: lesson.completedAt, unitId: lesson.unitId, position: lesson.position, status: lesson.status })
      .from(lesson)
      .where(eq(lesson.userId, user.id)),
    db.select().from(schema.unit).where(eq(schema.unit.userId, user.id)),
    db.select().from(schema.streakRestoration).where(eq(schema.streakRestoration.userId, user.id)),
  ]);

  const completed = lessons.filter((l) => l.status === "completed");
  // Consecutive local days with a completed Lesson, ending today, or yesterday while today isn't over.
  const days = new Set(completed.map((l) => localDay(l.at!, user.timezone)));
  const streakDays = new Set([...days, ...restorations.flatMap((r) => r.days)]);
  const today = localDay(now, user.timezone);
  let day = streakDays.has(today) ? today : dayBefore(today);
  let streak = 0;
  for (; streakDays.has(day); day = dayBefore(day)) streak++;
  const gap: string[] = [];
  while (!streakDays.has(day) && gap.length < 3) {
    gap.push(day);
    day = dayBefore(day);
  }
  const restorableDays = gap.length <= 2 && streakDays.has(day) ? gap : [];

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
  return { xp: 10 * answered!.n + 20 * completed.length, streak, week, learning, restorableDays };
}

export const progressRoute = (deps: Pick<Deps, "db" | "now" | "billingEnabled">) =>
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const at = deps.now();
      const [result, recovery] = await Promise.all([
        progress(deps.db, c.var.user, at),
        restorationPeriod(deps.db, c.var.user.id, at, deps.billingEnabled),
      ]);
      return c.json({ ...result, recovery });
    })
    .post("/restore", async (c) => {
      const at = deps.now();
      return deps.db.transaction(async (tx) => {
        await tx
          .select({ id: schema.user.id })
          .from(schema.user)
          .where(eq(schema.user.id, c.var.user.id))
          .for("update");
        await requirePro(tx, c.var.user.id, at, deps.billingEnabled);
        const period = await restorationPeriod(tx, c.var.user.id, at, deps.billingEnabled);
        if (!period.available)
          throw billingError(409, `Streak recovery is available again at ${period.nextAvailableAt.toISOString()}.`);
        const result = await progress(tx, c.var.user, at);
        if (!result.restorableDays.length)
          throw billingError(409, "There is no recent gap of one or two days to restore.");
        await tx.insert(schema.streakRestoration).values({
          userId: c.var.user.id,
          days: result.restorableDays,
          restoredAt: at,
          nextAvailableAt: period.resetsAt,
        });
        return c.json({ restored: true });
      });
    });
