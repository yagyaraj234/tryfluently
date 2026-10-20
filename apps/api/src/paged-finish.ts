import { schema, type Skill } from "@fluently/db";
import { and, eq } from "drizzle-orm";
import type { Deps } from "./app";
import { advanceUnit } from "./learning-memory";
import { recordScores } from "./scoring";
import { questionBlocks } from "./lesson-blocks";

const { lesson, step, assessmentJob: job } = schema;
type Ctx = Pick<Deps, "db" | "now"> & { settings: { alphaLesson: number } };

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

/**
 * Finishes a paged Lesson with no model call: complete, unlock the next Lesson, move skill scores, queue the analysis.
 * Finishing again changes nothing, except that a failed analysis is put back in the queue.
 */
export async function finishPagedLesson({ db, now, settings }: Ctx, id: string, userId: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    const [row] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, id), eq(lesson.userId, userId), eq(lesson.contentVersion, 2)))
      .for("update");
    if (!row) throw new Error("Lesson not found");
    if (row.status === "abandoned") return { status: "abandoned" as const };
    const at = now();
    if (row.status === "in_progress") {
      const steps = await tx.select().from(step).where(eq(step.lessonId, id));
      const questions = (row.material ?? []).flatMap((p: any, position) =>
        questionBlocks.includes(p.block) ? [{ position, question: p.question }] : [],
      );
      if (
        row.preparation !== "ready" ||
        row.preparationToken ||
        !row.pageStatus?.every((s) => s.page === "ready" && s.question === "ready") ||
        questions.some((q) => !q.question || !steps.some((s) => s.position === q.position && s.answeredAt))
      )
        return { status: "incomplete" as const };
      await recordScores(tx, userId, scoresFromVerdicts(steps), {
        alpha: settings.alphaLesson,
        source: "lesson",
        sourceId: id,
        at,
      });
      await tx.update(lesson).set({ status: "completed", completedAt: at }).where(eq(lesson.id, id));
      if (row.unitId) await advanceUnit(tx, row.unitId);
    }
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
