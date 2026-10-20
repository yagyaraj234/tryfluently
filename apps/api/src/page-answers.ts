import { schema } from "@impromptu/db";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Deps } from "./app";
import { questionBlocks, questionSchema, type Question } from "./lesson-blocks";
import { speakResult, startAnalysis } from "./speech-answers";

const { lesson, step } = schema;

/** Blocks the server grades on submit, with the pre-written explanation. Rewrite and speakPrompt are only saved for now. */
const graded = new Set(["vocabCard", "fillGap", "multipleChoice", "matchPairs", "reorder"]);
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
const short = z.string().trim().min(1).max(500);

/** What the Learner sends for each Block type (as `answer`). To add a Block, add it here and in `grade`. */
const answerShape: Record<Question["block"], z.ZodType> = {
  vocabCard: z.literal("seen"),
  fillGap: short,
  multipleChoice: z.number().int().min(0).max(4),
  matchPairs: z.array(z.object({ left: short, right: short })).max(6),
  reorder: z.array(short).max(10),
  rewrite: z.string().trim().min(1).max(2000),
  speakPrompt: z.string().trim().min(1).max(2000),
};

/** The correct answer in the same shape the Learner sends it. Only ever returned after a submit. */
function key(q: Question) {
  switch (q.block) {
    case "vocabCard":
    case "fillGap":
      return q.answer;
    case "multipleChoice":
      return q.answerIndex;
    case "matchPairs":
      return q.pairs;
    case "reorder":
      return q.answer;
    default:
      return null;
  }
}

function grade(q: Question, a: any) {
  switch (q.block) {
    case "vocabCard":
      return true; // Flipping the card is the answer: there is nothing to get wrong.
    case "fillGap":
      return norm(a) === norm(q.answer);
    case "multipleChoice":
      return a === q.answerIndex;
    case "matchPairs":
      return (
        a.length === q.pairs.length &&
        q.pairs.every((p) => a.some((x: { left: string; right: string }) => x.left === p.left && x.right === p.right))
      );
    case "reorder":
      return a.length === q.answer.length && a.every((x: string, i: number) => x === q.answer[i]);
    default:
      return null;
  }
}

/** What the Learner sees back. The same function builds a first submit and every later look, so they always match. */
export function pageResult(q: Question, answer: unknown, verdict: "correct" | "incorrect" | null) {
  return graded.has(q.block)
    ? {
        block: q.block,
        answer,
        verdict,
        correctAnswer: key(q),
        explanation: "explanation" in q ? q.explanation : null,
      }
    : { block: q.block, answer, verdict: null, correctAnswer: null, explanation: null };
}
export type PageResult = ReturnType<typeof pageResult>;

type Stored = { question?: Question };
type StepRow = typeof step.$inferSelect;

/** Results of the answered Pages, by Page index, for the player to show again after a refresh. */
export function answeredPages(l: typeof lesson.$inferSelect, rows: StepRow[]) {
  const out = new Map<number, PageResult>();
  for (const s of rows) {
    const q = (l.material?.[s.position] as Stored | undefined)?.question;
    if (q?.block === "speakPrompt" && s.answeredAt) out.set(s.position, speakResult(s.output?.answer, s));
    else if (q && s.answeredAt)
      out.set(
        s.position,
        pageResult(q, s.output?.answer, s.feedback ? (s.feedback.verdict as "correct" | "incorrect") : null),
      );
  }
  return out;
}

/**
 * Saves one Page's answer. Graded Blocks get a verdict at once, with no AI call. A second submit returns the first result.
 * The answer is a `step` row (position = Page index), so the finish and analysis step reads it like any other Step.
 */
export async function answerPage(
  ctx: Pick<Deps, "db" | "now" | "models">,
  userId: string,
  lessonId: string,
  index: number,
  answer: unknown,
) {
  const r = await save(ctx, userId, lessonId, index, answer);
  // A spoken answer's transcript is analysed in the background, once it is safely saved.
  if (r.status === 201 && r.result.block === "speakPrompt") startAnalysis(ctx, userId, lessonId, index);
  return r;
}

async function save(
  { db, now }: Pick<Deps, "db" | "now">,
  userId: string,
  lessonId: string,
  index: number,
  answer: unknown,
) {
  return db.transaction(async (tx) => {
    const [l] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, lessonId), eq(lesson.userId, userId), eq(lesson.contentVersion, 2)))
      .for("update");
    if (!l) return { status: 404 as const, error: "Lesson not found" };
    const q = (l.material?.[index] as Stored | undefined)?.question;
    if (!q || l.pageStatus?.[index]?.question !== "ready" || !questionBlocks.includes(q.block))
      return { status: 409 as const, error: "This Page has no question yet" };
    const [saved] = await tx
      .select()
      .from(step)
      .where(and(eq(step.lessonId, l.id), eq(step.position, index)));
    if (saved) return { status: 200 as const, result: answeredPages(l, [saved]).get(index)! };
    if (l.status !== "in_progress") return { status: 409 as const, error: "This Lesson has ended" };
    const parsed = answerShape[q.block].safeParse(answer);
    if (!parsed.success) return { status: 400 as const, error: "That answer isn't valid for this question" };
    const ok = grade(questionSchema.parse(q), parsed.data);
    const verdict = ok === null ? null : ok ? ("correct" as const) : ("incorrect" as const);
    const speak = q.block === "speakPrompt";
    const analysis = { state: "analysing" as const, at: Date.now() };
    const result = speak
      ? speakResult(parsed.data, { feedback: null, output: { analysis } })
      : pageResult(q, parsed.data, verdict);
    await tx.insert(step).values({
      userId,
      lessonId: l.id,
      position: index,
      type: q.block,
      input: { page: index, prompt: "prompt" in q ? q.prompt : null },
      output: speak ? { answer: parsed.data, analysis } : { answer: parsed.data },
      feedback: verdict && {
        verdict,
        corrected: JSON.stringify(result.correctAnswer),
        explanation: result.explanation ?? "",
      },
      answeredAt: now(),
    });
    return { status: 201 as const, result };
  });
}

/** Where the Learner is now. Pages are 0-based; `pages.length` is the recap. */
export async function setCurrentPage(db: Deps["db"], userId: string, lessonId: string, page: number) {
  const [l] = await db
    .select({ n: lesson.pageStatus })
    .from(lesson)
    .where(and(eq(lesson.id, lessonId), eq(lesson.userId, userId), eq(lesson.contentVersion, 2)));
  if (!l || page > (l.n?.length ?? 0)) return false;
  await db.update(lesson).set({ currentPage: page }).where(eq(lesson.id, lessonId));
  return true;
}

export const stepsOf = (db: Deps["db"], lessonId: string) =>
  db.select().from(step).where(eq(step.lessonId, lessonId)).orderBy(asc(step.position));
