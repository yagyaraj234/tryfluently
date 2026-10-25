import { schema } from "@fluently/db";
import { Output } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { generate } from "./ai";
import type { Deps } from "./app";
import { promptOf, publicQuestion, questionProblem, questionSchema, type Question } from "./lesson-blocks";
import { mistakesOf, stepsOf } from "./page-answers";
import { QUIZ_VERSION } from "./paged-lessons";

const { lesson, step, assessmentJob: job } = schema;
type Ctx = Pick<Deps, "db" | "now" | "models"> & { signal?: AbortSignal };

const ROUND = 5;
const MAX_RETRIES = 2;
// A plain union, not questionSchema: a discriminated union becomes `oneOf`, which OpenAI structured output rejects.
const roundOutput = z.object({ questions: z.array(z.union(questionSchema.options)) });

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Cheap rules on a round: 5 questions, checked like the Quiz's, none repeating an earlier one or each other. */
function roundProblem(questions: Question[], asked: Question[]) {
  if (questions.length !== ROUND) return `needs exactly ${ROUND} questions, not ${questions.length}`;
  const seen = new Set(asked.map((q) => norm(promptOf(q))));
  for (const [i, q] of questions.entries()) {
    if (q.block === "vocabCard") return `question ${i + 1} is a vocab card, which is never quizzed`;
    const problem = questionProblem(q);
    if (problem) return `question ${i + 1} rejected: ${problem}`;
    const key = norm(promptOf(q));
    if (seen.has(key)) return `question ${i + 1} repeats an earlier question`;
    seen.add(key);
  }
}

/**
 * Practice more: queues a round once every question so far is answered, before the Lesson completes.
 * A failed round is queued again the same way.
 */
export async function requestPracticeRound({ db, now }: Pick<Deps, "db" | "now">, userId: string, lessonId: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    const [l] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, lessonId), eq(lesson.userId, userId), eq(lesson.contentVersion, QUIZ_VERSION)))
      .for("update");
    if (!l) return { status: 404 as const, error: "Lesson not found" };
    const answered = new Set(
      (await tx.select().from(step).where(eq(step.lessonId, l.id))).filter((s) => s.answeredAt).map((s) => s.position),
    );
    const atChoice = Boolean(l.quiz?.length) && l.quiz!.every((_, i) => answered.has(i));
    if (l.status !== "in_progress" || !atChoice || l.practice === "preparing")
      return { status: 409 as const, error: "Practice is offered once every question is answered" };
    await tx.update(lesson).set({ practice: "preparing" }).where(eq(lesson.id, l.id));
    await tx
      .insert(job)
      .values({ lessonId: l.id, userId, kind: "practice_round", availableAt: now() })
      .onConflictDoUpdate({
        target: [job.lessonId, job.kind],
        set: { status: "pending", attempts: 0, availableAt: now(), token: null, lockedAt: null },
      });
    return { status: 202 as const };
  });
}

/** Runs one `practice_round` job: one call writes 5 questions from the Pages, leaning toward the Learner's mistakes. */
export async function writePracticeRound(ctx: Ctx, lessonId: string, attempt: number) {
  const { db, models } = ctx;
  const [l] = await db.select().from(lesson).where(eq(lesson.id, lessonId));
  if (!l || l.practice !== "preparing" || l.status !== "in_progress") return;
  const waiting = and(eq(lesson.id, lessonId), eq(lesson.practice, "preparing"));
  const fail = () => db.update(lesson).set({ practice: "failed" }).where(waiting);
  try {
    const asked = (l.quiz ?? []).map((q) => q.question as Question);
    const mistakes = mistakesOf(l, await stepsOf(db, l.id));
    const pages = (l.material ?? []).map((p: any) => ({
      title: p.title,
      body: p.body,
      example: p.example,
      vocab: p.vocab ?? null,
    }));
    let feedback = "";
    for (let tries = 0; tries <= MAX_RETRIES; tries++) {
      try {
        const { output } = await generate(ctx, l.userId, {
          model: models.step,
          reasoning: "low",
          abortSignal: ctx.signal,
          instructions: `Write a Practice Round of exactly ${ROUND} new questions for an English Lesson the Learner has just been quizzed on. Use only what its Pages teach, and lean toward the Learner's mistakes. Never repeat or reword a question in "asked". Use the Blocks fillGap, multipleChoice, matchPairs, reorder, rewrite or speakPrompt (never vocabCard). Give the exact answer and a one or two sentence explanation so answers can be graded with no AI later. A fillGap prompt has exactly one "___" and never contains its answer. For rewrite and speakPrompt give the prompt, an expectedAnswer and a short rubric instead. Plain text only: no markdown or asterisks.${feedback}`,
          prompt: JSON.stringify({
            lesson: l.title,
            objective: l.objective,
            pages,
            mistakes,
            asked: asked.map(publicQuestion),
          }),
          output: Output.object({ schema: roundOutput }),
        });
        const questions = roundOutput.parse(output).questions as Question[];
        const problem = roundProblem(questions, asked);
        if (problem) {
          console.error(`Lesson ${lessonId} Practice Round attempt ${tries + 1} rejected: ${problem}`);
          feedback = ` Your previous attempt was rejected: ${problem}. Fix that this time.`;
          continue;
        }
        return void (await db.transaction(async (tx) => {
          const [cur] = await tx.select().from(lesson).where(waiting).for("update");
          if (!cur || cur.status !== "in_progress") return;
          const round = Math.max(0, ...(cur.quiz ?? []).map((q) => q.round)) + 1;
          const quiz = [...(cur.quiz ?? []), ...questions.map((question) => ({ page: null, round, question }))];
          await tx.update(lesson).set({ quiz, practice: null }).where(eq(lesson.id, lessonId));
        }));
      } catch (error) {
        if (ctx.signal?.aborted) throw error;
        console.error(`Lesson ${lessonId} Practice Round attempt ${tries + 1} failed`, error);
      }
    }
    await fail();
  } catch (error) {
    // Database trouble: the job retries, and its last attempt fails the round.
    if (attempt >= 3) await fail();
    throw error;
  }
}
