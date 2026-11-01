import { schema, type Skill, type Tx } from "@fluently/db";
import { and, eq, gte, isNull } from "drizzle-orm";
import { defaultSettings, type Deps } from "./app";
import { advanceUnit } from "./learning-memory";
import { reconcileLessonScores } from "./scoring";
import { questionBlocks } from "./lesson-blocks";

const { lesson, step, assessmentJob: job } = schema;
// `db` may be a transaction: Learn more completes a Lesson inside its own.
type Ctx = { db: Tx; now: Deps["now"]; settings: { alphaLesson: number } };

// Which skill a graded Block gives evidence for. Vocab cards are never wrong. A spoken answer counts towards fluency once its analysis has saved a verdict.
const blockSkill: Record<string, Skill | undefined> = {
  fillGap: "grammar",
  multipleChoice: "grammar",
  reorder: "grammar",
  rewrite: "grammar",
  speakPrompt: "fluency",
  matchPairs: "vocabulary",
};
const credit = { correct: 1, almost: 0.5, incorrect: 0 } as const;

/** 0-100 per skill from the saved verdicts. Answers with no verdict yet (a spoken answer still being analysed, or one that failed) are left out. */
export function scoresFromVerdicts(steps: { type: string; feedback: { verdict: string } | null }[]) {
  const got: Partial<Record<Skill, number[]>> = {};
  for (const s of steps) {
    const skill = blockSkill[s.type];
    const points = credit[s.feedback?.verdict as keyof typeof credit];
    if (skill && points !== undefined) (got[skill] ??= []).push(points);
  }
  return Object.fromEntries(
    Object.entries(got).map(([skill, v]) => [skill, (100 * v.reduce((a, b) => a + b, 0)) / v.length]),
  ) as Partial<Record<Skill, number>>;
}

/** Caller holds the Learner and Lesson locks, shared by Finish and feedback writes. */
async function reconcilePagedScores(
  db: Parameters<typeof reconcileLessonScores>[0],
  row: typeof lesson.$inferSelect,
  alpha: number,
  at: Date,
) {
  if (row.contentVersion < 2 || row.status !== "completed") return;
  const steps = await db.select().from(step).where(eq(step.lessonId, row.id));
  await reconcileLessonScores(db, row.userId, row.id, scoresFromVerdicts(steps), alpha, row.completedAt ?? at);
}

/** Feedback and its score correction commit together, whether it arrives before or after Finish. */
export async function savePageFeedback(
  { db, now, settings }: Pick<Deps, "db" | "now" | "settings">,
  userId: string,
  lessonId: string,
  stepId: string,
  feedback: NonNullable<typeof step.$inferSelect.feedback>,
) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    const [row] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, lessonId), eq(lesson.userId, userId)))
      .for("update");
    if (!row) return;
    await tx
      .update(step)
      .set({ feedback, timing: null })
      .where(and(eq(step.id, stepId), eq(step.lessonId, lessonId), isNull(step.feedback)));
    await reconcilePagedScores(tx, row, settings?.alphaLesson ?? defaultSettings.alphaLesson, now());
  });
}

/**
 * Finishes a paged Lesson with no model call: complete, unlock the next Lesson, move skill scores, queue the analysis.
 * Finishing again reconciles saved verdicts without another measurement and requeues a failed analysis.
 */
export async function finishPagedLesson({ db, now, settings }: Ctx, id: string, userId: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    const [row] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, id), eq(lesson.userId, userId), gte(lesson.contentVersion, 2)))
      .for("update");
    if (!row) throw new Error("Lesson not found");
    if (row.status === "abandoned" || row.status === "skipped") return { status: row.status };
    const at = now();
    if (row.status === "in_progress") {
      const steps = await tx.select().from(step).where(eq(step.lessonId, id));
      const questions =
        row.contentVersion >= 3
          ? (row.quiz ?? []).map((q, position) => ({ position, question: q.question }))
          : (row.material ?? []).flatMap((p: any, position) =>
              questionBlocks.includes(p.block) ? [{ position, question: p.question }] : [],
            );
      if (
        row.preparation !== "ready" ||
        row.practice === "preparing" ||
        row.preparationToken ||
        !row.pageStatus?.every((s) => s.page === "ready" && s.question === "ready") ||
        questions.some((q) => !q.question || !steps.some((s) => s.position === q.position && s.answeredAt))
      )
        return { status: "incomplete" as const };
      await tx.update(lesson).set({ status: "completed", completedAt: at }).where(eq(lesson.id, id));
      if (row.unitId) await advanceUnit(tx, row.unitId);
    }
    await reconcilePagedScores(
      tx,
      { ...row, status: "completed", completedAt: row.completedAt ?? at },
      settings.alphaLesson,
      at,
    );
    await tx
      .insert(job)
      .values({ lessonId: id, userId, kind: "lesson_analysis", availableAt: at })
      .onConflictDoUpdate({
        target: [job.lessonId, job.kind],
        set: { status: "pending", attempts: 0, availableAt: at, token: null, lockedAt: null },
        setWhere: eq(job.status, "failed"),
      });
    return { status: "completed" as const };
  });
}
