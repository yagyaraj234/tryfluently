import { z } from "zod";

/**
 * Question data for each interactive Block type, stored server-side in the Lesson row (material[i].question).
 * One place so the grading endpoint and the Lesson player share the same shapes.
 * `Question` is the full saved shape (answer key + explanation). `publicQuestion` is what a Learner may see before submitting.
 */
const text = z.string().trim().min(1).max(500);
const explanation = text;

export const vocabCardQuestion = z.object({ block: z.literal("vocabCard"), term: text, answer: text, explanation });
export const fillGapQuestion = z.object({ block: z.literal("fillGap"), prompt: text, answer: text, explanation });
export const multipleChoiceQuestion = z.object({
  block: z.literal("multipleChoice"),
  prompt: text,
  options: z.array(text).min(2).max(5),
  answerIndex: z.number().int().min(0),
  explanation,
});
export const matchPairsQuestion = z.object({
  block: z.literal("matchPairs"),
  prompt: text,
  pairs: z
    .array(z.object({ left: text, right: text }))
    .min(2)
    .max(6),
  explanation,
});
/** `answer` is the correct order; the Learner is sent the same items sorted so the order is not given away. */
export const reorderQuestion = z.object({
  block: z.literal("reorder"),
  prompt: text,
  answer: z.array(text).min(2).max(10),
  explanation,
});
export const rewriteQuestion = z.object({
  block: z.literal("rewrite"),
  prompt: text,
  expectedAnswer: text,
  rubric: text,
});
export const speakPromptQuestion = z.object({
  block: z.literal("speakPrompt"),
  prompt: text,
  expectedAnswer: text,
  rubric: text,
});

export const questionSchema = z.discriminatedUnion("block", [
  vocabCardQuestion,
  fillGapQuestion,
  multipleChoiceQuestion,
  matchPairsQuestion,
  reorderQuestion,
  rewriteQuestion,
  speakPromptQuestion,
]);
export type Question = z.infer<typeof questionSchema>;
/** Blocks that carry a question. `reading` has none. */
export const questionBlocks: string[] = questionSchema.options.map((o) => o.shape.block.value);

/** What the question agent returns: one question per interactive Page, by Page index (0-based). */
export const questionsOutput = z.object({
  questions: z.array(z.object({ page: z.number().int().min(0), question: questionSchema })),
});

/** Whether `phrase` appears in `text` as whole words, so `is` isn't found inside `This`. */
export function hasPhrase(text: string, phrase: string) {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(text);
}

/** Cheap rules on top of the schema. Returns a reason, or undefined when the question is fine. */
export function questionProblem(q: Question) {
  if (q.block === "multipleChoice" && q.answerIndex >= q.options.length) return "answerIndex out of range";
  if (q.block === "multipleChoice" && new Set(q.options).size !== q.options.length) return "duplicate options";
  if (q.block === "fillGap" && !q.prompt.includes("___")) return "fillGap prompt has no gap";
  if (q.block === "fillGap" && hasPhrase(q.prompt, q.answer)) return "answer is in the prompt";
}

const sorted = (a: string[]) => [...a].sort((x, y) => x.localeCompare(y));

/** The Learner-safe view: the question itself, never the answer key, explanation or rubric. */
export function publicQuestion(q: Question) {
  switch (q.block) {
    case "vocabCard":
      return { block: q.block, term: q.term };
    case "fillGap":
      return { block: q.block, prompt: q.prompt };
    case "multipleChoice":
      return { block: q.block, prompt: q.prompt, options: q.options };
    case "matchPairs":
      return {
        block: q.block,
        prompt: q.prompt,
        left: q.pairs.map((p) => p.left),
        right: sorted(q.pairs.map((p) => p.right)),
      };
    case "reorder": {
      const items = sorted(q.answer);
      return { block: q.block, prompt: q.prompt, items: items.join() === q.answer.join() ? items.reverse() : items };
    }
    case "rewrite":
    case "speakPrompt":
      return { block: q.block, prompt: q.prompt };
  }
}
