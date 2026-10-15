import { tool, type ToolUIPart, type UIMessage } from "ai";
import { z } from "zod";

const textAnswer = z.object({ answer: z.string().trim().min(1).max(2000) });
type TextAnswer = z.infer<typeof textAnswer>;

// Step tools have no `execute`: the client renders them and returns the Learner's answer as the tool output.
export const stepTools = {
  fillGap: tool({
    description: "A sentence with one gap (___) for the Learner to fill. Graded on the server by exact match.",
    inputSchema: z.object({ sentence: z.string(), answer: z.string(), choices: z.array(z.string()).optional() }),
    outputSchema: textAnswer,
  }),
  vocabCard: tool({
    description: "Teach a word: show it with its meaning and an example, then the Learner writes their own sentence using it.",
    inputSchema: z.object({ word: z.string(), meaning: z.string(), example: z.string() }),
    outputSchema: textAnswer,
  }),
  rewrite: tool({
    description: "A flawed or plain sentence and what to aim for; the Learner writes an improved version.",
    inputSchema: z.object({ sentence: z.string(), aim: z.string() }),
    outputSchema: textAnswer,
  }),
};
export type StepType = keyof typeof stepTools;
export const stepTypes = Object.keys(stepTools) as StepType[];

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Steps the server can check itself; the rest are judged by the model.
function grade(type: StepType, input: any, output: TextAnswer) {
  if (type === "fillGap") return { correct: normalise(output.answer) === normalise(input.answer), expected: input.answer as string };
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
  const g = grade(type, pending.input, output.data);
  const done = { ...pending, state: "output-available", output: { ...output.data, ...(g && { grade: g }) } };
  return {
    messages: [...stored.slice(0, -1), { ...last!, parts: last!.parts.map((p) => (p === pending ? done : p)) } as UIMessage],
    answered: { type, input: pending.input, output: output.data, grade: g },
  };
}
