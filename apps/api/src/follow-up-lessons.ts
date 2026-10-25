import { schema, type Tx } from "@fluently/db";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Deps } from "./app";
import { mistakesOf } from "./page-answers";
import { finishPagedLesson } from "./paged-finish";
import { QUIZ_VERSION, startLesson } from "./paged-lessons";

const { lesson, step, unit } = schema;
/** At most this many Follow-up Lessons follow one original Lesson. */
const MAX_CHAIN = 2;
const ordinal = ["a second", "a third"];

/** The outline entry of a Unit's Lesson, which says whether it is a Follow-up Lesson and how far down its chain. */
async function outlineEntry(db: Tx, l: { unitId: string | null; position: number }) {
  if (!l.unitId) return undefined;
  const [u] = await db.select({ outline: unit.lessonOutline }).from(unit).where(eq(unit.id, l.unitId));
  return u?.outline.find((p) => p.position === l.position);
}

/** Whether the choice may offer Learn more: not from the last Follow-up Lesson a chain allows. */
export async function canLearnMore(db: Tx, l: { unitId: string | null; position: number }) {
  return Boolean(l.unitId) && ((await outlineEntry(db, l))?.followUp?.depth ?? 0) < MAX_CHAIN;
}

/** What a Follow-up Lesson's planner is told: the parent Lesson's wrong answers and the Learner's note. */
export async function followUpBrief(db: Tx, l: { unitId: string | null; position: number }) {
  const followUp = (await outlineEntry(db, l))?.followUp;
  if (!followUp) return undefined;
  const [parent] = await db.select().from(lesson).where(eq(lesson.id, followUp.of));
  const steps = parent ? await db.select().from(step).where(eq(step.lessonId, parent.id)) : [];
  return { note: followUp.note, mistakes: parent ? mistakesOf(parent, steps) : [] };
}

/**
 * Learn more: completes the Lesson at the choice and inserts a Follow-up Lesson right after it, moving later outline
 * entries and Lessons down one place, then starts it. All in one transaction, so the Unit can't be mastered between.
 */
export async function learnMore(
  { db, now, settings }: Pick<Deps, "db" | "now"> & { settings: { alphaLesson: number } },
  userId: string,
  lessonId: string,
  note: string | null,
) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    const [l] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, lessonId), eq(lesson.userId, userId), eq(lesson.contentVersion, QUIZ_VERSION)))
      .for("update");
    if (!l?.unitId) return { status: 404 as const, error: "Lesson not found" };
    const answered = new Set(
      (await tx.select().from(step).where(eq(step.lessonId, l.id))).filter((s) => s.answeredAt).map((s) => s.position),
    );
    const [u] = await tx.select().from(unit).where(eq(unit.id, l.unitId)).for("update");
    const entry = u?.lessonOutline.find((p) => p.position === l.position);
    const atChoice =
      l.status === "in_progress" &&
      l.practice !== "preparing" &&
      Boolean(l.quiz?.length) &&
      l.quiz!.every((_, i) => answered.has(i));
    const depth = (entry?.followUp?.depth ?? 0) + 1;
    if (!u || u.status !== "active" || !entry || !atChoice || depth > MAX_CHAIN)
      return { status: 409 as const, error: "Learn more isn't available for this Lesson" };

    const at = l.position + 1;
    const root = entry.followUp?.root ?? entry.title;
    const followUp = {
      ...entry,
      position: at,
      title: `${root}: ${ordinal[depth - 1]} look`,
      followUp: { of: l.id, depth, note, root },
    };
    const lessonOutline = [
      ...u.lessonOutline.map((p) => (p.position >= at ? { ...p, position: p.position + 1 } : p)),
      followUp,
    ].sort((a, b) => a.position - b.position);
    await tx.update(unit).set({ lessonOutline }).where(eq(unit.id, u.id));
    await tx
      .update(lesson)
      .set({ position: sql`${lesson.position} + 1` })
      .where(and(eq(lesson.unitId, u.id), gte(lesson.position, at)));

    const done = await finishPagedLesson({ db: tx, now, settings }, l.id, userId);
    if (done.status !== "completed") throw new Error(`Lesson ${l.id} could not complete: ${done.status}`);
    const started = await startLesson({ db: tx, now }, userId, at);
    if ("error" in started) throw new Error(`Follow-up Lesson could not start: ${started.error}`);
    return { status: 201 as const, lesson: started.lesson };
  });
}
