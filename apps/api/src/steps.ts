import { tool, type ToolUIPart, type UIMessage } from "ai";
import { z } from "zod";

const textAnswer = z.object({ answer: z.string().trim().min(1).max(2000) });
type TextAnswer = z.infer<typeof textAnswer>;
const teaching = z.object({ title: z.string().min(1).max(150), body: z.string().min(1).max(1500), example: z.string().max(500).optional() }).optional();

// Step tools have no `execute`: the client renders them and returns the Learner's answer as the tool output.
export const stepTools = {
  fillGap: tool({
    description: "A sentence with one gap (___) for the Learner to fill. Graded on the server by exact match.",
    inputSchema: z.object({ sentence: z.string(), answer: z.string(), choices: z.array(z.string()).optional(), teaching }),
    outputSchema: textAnswer,
  }),
  vocabCard: tool({
    description: "Teach a word: show it with its meaning and an example, then the Learner writes their own sentence using it.",
    inputSchema: z.object({ word: z.string(), meaning: z.string(), example: z.string(), teaching }),
    outputSchema: textAnswer,
  }),
  rewrite: tool({
    description: "A flawed or plain sentence and what to aim for; the Learner writes an improved version.",
    inputSchema: z.object({ sentence: z.string(), aim: z.string(), teaching }),
    outputSchema: textAnswer,
  }),
  speakPrompt: tool({
    description: "An open question the Learner answers out loud at length; they record it and you judge the transcript.",
    inputSchema: z.object({ question: z.string(), targetSeconds: z.number().int().min(30).max(90), teaching }),
    outputSchema: textAnswer,
  }),
  fillGaps: tool({
    description: "Complete 2–6 blanks (___) in a sentence. Answers are ordered by blank; offer choices without revealing the answer.",
    inputSchema: z.object({ sentence: z.string().min(1).max(1500), answers: z.array(z.string().min(1).max(200)).min(2).max(6), choices: z.array(z.string().min(1).max(200)).max(12).optional(), teaching })
      .refine((v) => (v.sentence.match(/_{2,}/g) ?? []).length === v.answers.length, "One answer is required per blank"),
    outputSchema: textAnswer,
  }),
  reorder: tool({
    description: "Arrange sentence parts or conversation turns. Supply shuffled items and the correct order as zero-based item indices.",
    inputSchema: z.object({ prompt: z.string().min(1).max(500), items: z.array(z.string().min(1).max(300)).min(2).max(8), order: z.array(z.number().int().min(0)).min(2).max(8), teaching })
      .refine((v) => v.order.length === v.items.length && new Set(v.order).size === v.items.length && v.order.every((n) => n < v.items.length), "Order must include every item exactly once"),
    outputSchema: textAnswer,
  }),
};
export type StepType = keyof typeof stepTools;
export const stepTypes = Object.keys(stepTools) as StepType[];

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Steps the server can check itself; the rest are judged by the model.
function grade(type: StepType, input: any, output: TextAnswer) {
  if (type === "fillGap") return { correct: normalise(output.answer) === normalise(input.answer), expected: input.answer as string };
  if (type === "fillGaps") {
    const values: string[] = JSON.parse(output.answer);
    let i = 0;
    return { correct: values.every((v, n) => normalise(v) === normalise(input.answers[n])), expected: input.sentence.replace(/_{2,}/g, () => input.answers[i++]) as string };
  }
  if (type === "reorder") {
    const values: number[] = JSON.parse(output.answer);
    return { correct: values.every((v, n) => v === input.order[n]), expected: input.order.map((n: number) => input.items[n]).join(" ") as string };
  }
  return null;
}

export type Answered = { type: StepType; input: any; output: TextAnswer; grade: ReturnType<typeof grade> };

const stepTypeOf = (p: UIMessage["parts"][number]) => p.type.replace(/^tool-/, "") as StepType;
const isStep = (p: UIMessage["parts"][number], state: string): p is ToolUIPart =>
  stepTypes.includes(stepTypeOf(p)) && "state" in p && p.state === state;

// Step parts the Learner has answered so far.
export const answeredSteps = (messages: UIMessage[]) => messages.flatMap((m) => m.parts.filter((p) => isStep(p, "output-available")));

// Adds the client's newest message to the stored history: a Learner message, or the last assistant message with
// the waiting Step answered. Only the answer is taken from the client; the Step itself comes from what was stored.
export function takeAnswer(
  stored: UIMessage[],
  incoming: any,
): { messages: UIMessage[]; answered?: Answered } | { error: string; status: 400 | 409; issues?: unknown } {
  const last = stored.at(-1);
  const pending = last?.role === "assistant" ? last.parts.find((p) => isStep(p, "input-available")) : undefined;
  if (!pending) {
    if (incoming?.role !== "user") return { error: "Expected a message from the Learner", status: 400 };
    return { messages: [...stored, incoming] };
  }
  if (incoming?.role !== "assistant" || incoming.id !== last!.id) return { error: "Answer the current Step first", status: 409 };

  const sent = incoming.parts?.find?.((p: any) => p.toolCallId === pending.toolCallId);
  const output = textAnswer.safeParse(sent?.output);
  if (!output.success) return { error: "That answer isn't valid", status: 400, issues: output.error.issues };
  const type = stepTypeOf(pending);
  // Structured answers come from the client; validate shape against the stored Step before grading.
  if (type === "fillGaps" || type === "reorder") {
    let values: unknown;
    try { values = JSON.parse(output.data.answer); } catch { return { error: "That answer isn't valid", status: 400 }; }
    const input = pending.input as any;
    const valid = type === "fillGaps"
      ? z.array(z.string().trim().min(1).max(200)).length(input.answers.length).safeParse(values)
      : z.array(z.number().int().min(0).max(input.items.length - 1)).length(input.items.length).refine((v) => new Set(v).size === v.length).safeParse(values);
    if (!valid.success) return { error: "That answer isn't valid", status: 400 };
  }
  const g = grade(type, pending.input, output.data);
  const done = { ...pending, state: "output-available", output: { ...output.data, ...(g && { grade: g }) } };
  return {
    messages: [...stored.slice(0, -1), { ...last!, parts: last!.parts.map((p) => (p === pending ? done : p)) } as UIMessage],
    answered: { type, input: pending.input, output: output.data, grade: g },
  };
}
