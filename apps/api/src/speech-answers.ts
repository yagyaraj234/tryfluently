import { schema } from "@impromptu/db";
import { Output } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { generate } from "./ai";
import type { Deps } from "./app";
import type { Question } from "./lesson-blocks";

const { lesson, step } = schema;
type Ctx = Pick<Deps, "db" | "now" | "models">;
type Speak = Extract<Question, { block: "speakPrompt" }>;
type StepRow = typeof step.$inferSelect;
type Analysis = { state: "analysing"; at: number } | { state: "failed" };

/** An analysis that has been running this long is treated as lost (for example the server restarted), so the Learner can retry. */
const STALE_MS = 60_000;

const analysisOutput = z.object({
  verdict: z.enum(["correct", "incorrect"]),
  feedback: z.string().trim().min(1).max(600),
});

/** What a Learner sees for a spoken answer. `analysis` says whether feedback is still coming, ready or needs a retry. */
export function speakResult(answer: unknown, row?: Pick<StepRow, "feedback" | "output">) {
  const a = row?.output?.analysis as Analysis | undefined;
  const status = row?.feedback
    ? ("done" as const)
    : !a || a.state === "failed" || Date.now() - a.at > STALE_MS
      ? ("failed" as const)
      : ("analysing" as const);
  return {
    block: "speakPrompt" as const,
    answer,
    verdict: row?.feedback
      ? row.feedback.verdict === "incorrect"
        ? ("incorrect" as const)
        : ("correct" as const)
      : null,
    correctAnswer: null,
    explanation: row?.feedback?.explanation ?? null,
    analysis: status,
  };
}

/** Analyses that are running right now. Tests wait on this; the server never needs to. */
const running = new Set<Promise<unknown>>();
export const settleAnalyses = async () => void (await Promise.allSettled([...running]));

/** Starts the analysis in the background. The Learner is not kept waiting and can move on. */
export function startAnalysis(ctx: Ctx, userId: string, lessonId: string, index: number) {
  const p: Promise<unknown> = analyse(ctx, userId, lessonId, index).finally(() => running.delete(p));
  running.add(p);
}

/**
 * One small, fast text analysis of the transcript against the prompt and rubric. It never touches audio.
 * On failure the answer stays saved and marked failed, so the Learner can retry.
 */
async function analyse(ctx: Ctx, userId: string, lessonId: string, index: number) {
  const { db, models } = ctx;
  const [l] = await db.select().from(lesson).where(eq(lesson.id, lessonId));
  const q = (l?.material?.[index] as { question?: Speak } | undefined)?.question;
  const [row] = await db
    .select()
    .from(step)
    .where(and(eq(step.lessonId, lessonId), eq(step.position, index)));
  if (!q || q.block !== "speakPrompt" || !row || row.feedback) return;
  const mark = (analysis: Analysis) =>
    db
      .update(step)
      .set({ output: { ...row.output, analysis } })
      .where(eq(step.id, row.id));
  try {
    const { output } = await generate(ctx, userId, {
      model: models.step,
      reasoning: "low",
      instructions: `You review a Learner's spoken answer in an English Lesson. You get only a transcript made by the browser's speech recognizer, which may have auto-corrected the Learner's grammar or word choice, so weigh content and structure and do not penalise tiny slips. Judge whether the answer does what the prompt asks (use the expected answer and rubric privately). Give a verdict, then two or three short, kind sentences of feedback on content, vocabulary and grammar. Never quote the rubric or expected answer.`,
      prompt: JSON.stringify({
        prompt: q.prompt,
        expectedAnswer: q.expectedAnswer,
        rubric: q.rubric,
        transcript: (row.output as { answer?: string } | null)?.answer,
      }),
      output: Output.object({ schema: analysisOutput }),
    });
    const r = analysisOutput.parse(output);
    await db
      .update(step)
      .set({ feedback: { verdict: r.verdict, corrected: "", explanation: r.feedback } })
      .where(eq(step.id, row.id));
  } catch (error) {
    console.error(`Lesson ${lessonId} speech analysis for Page ${index + 1} failed`, error);
    await mark({ state: "failed" });
  }
}

/** Retries a failed or lost analysis. Already finished or still running ones are left alone. */
export async function retryAnalysis(ctx: Ctx, userId: string, lessonId: string, index: number) {
  const [row] = await ctx.db
    .select()
    .from(step)
    .where(
      and(eq(step.lessonId, lessonId), eq(step.position, index), eq(step.userId, userId), eq(step.type, "speakPrompt")),
    );
  if (!row) return undefined;
  const result = speakResult(row.output?.answer, row);
  if (result.analysis !== "failed") return result;
  const output = { ...row.output, analysis: { state: "analysing", at: Date.now() } };
  await ctx.db.update(step).set({ output }).where(eq(step.id, row.id));
  startAnalysis(ctx, userId, lessonId, index);
  return speakResult(row.output?.answer, { feedback: null, output });
}
