import {
  FillGapStep,
  FillGapsStep,
  ReorderStep,
  RewriteStep,
  SpeakPromptStep,
  StepHeader,
  toastManager,
  VocabCardStep,
  type FillGapStepProps,
  type RewriteStepProps,
  type VocabCardStepProps,
  type VoiceProps,
} from "@fluently/ui";
import type { ToolUIPart, UIMessage } from "ai";
import type { ReactNode } from "react";
import { hearIt } from "../../hooks/voice";
import type { Feedback } from "./lesson";

type Answer = { onAnswer: (answer: string) => void; pending: boolean; answered?: string };
type StepKind<I> = {
  type: string;
  question: (input: I) => string;
  render: (input: I, answer: Answer, voice: VoiceProps) => ReactNode;
};
const kind = <I,>(k: StepKind<I>) => k as StepKind<unknown>;

export const play = (text: string) =>
  hearIt(text).catch(() =>
    toastManager.add({ title: "The audio couldn't be played", description: "Try again in a moment." }),
  );

export const stepKinds: Record<string, StepKind<unknown>> = {
  vocabCard: kind<Omit<VocabCardStepProps, keyof Answer>>({
    type: "New word",
    question: (input) => `Use "${input.word}" in a sentence of your own`,
    render: (input, answer, voice) => (
      <VocabCardStep {...input} {...answer} voice={voice} onHearIt={() => void play(input.word)} />
    ),
  }),
  fillGap: kind<Omit<FillGapStepProps, keyof Answer>>({
    type: "Fill the gap",
    question: () => "Complete the sentence",
    render: (input, answer) => <FillGapStep {...input} {...answer} />,
  }),
  fillGaps: kind<{ sentence: string; choices?: string[] }>({
    type: "Fill the blanks",
    question: () => "Complete the sentence",
    render: (input, answer) => <FillGapsStep {...input} {...answer} />,
  }),
  reorder: kind<{ prompt: string; items: string[] }>({
    type: "Put it in order",
    question: (input) => input.prompt,
    render: (input, answer) => <ReorderStep {...input} {...answer} />,
  }),
  rewrite: kind<Omit<RewriteStepProps, keyof Answer> & { aim: string }>({
    type: "Rewrite",
    question: (input) => input.aim,
    render: (input, answer) => <RewriteStep {...input} {...answer} />,
  }),
  speakPrompt: kind<{ question: string; targetSeconds: number }>({
    type: "Speak",
    question: (input) => input.question,
    render: (input, answer, voice) => <SpeakPromptStep targetSeconds={input.targetSeconds} {...answer} {...voice} />,
  }),
};

// Lessons adapt (3 to 10 Steps), so the header shows an estimate that stays ahead of the Learner.
const EXPECTED_STEPS = 5;

export function Header({ step, position }: { step: ToolUIPart; position: number }) {
  const k = stepKinds[stepName(step)]!;
  const progress = { position, total: Math.max(EXPECTED_STEPS, position + 1) };
  return <StepHeader type={k.type} progress={progress} question={k.question(step.input)} />;
}

export const stepName = (p: { type: string }) => p.type.replace(/^tool-/, "");
const isTool = (p: UIMessage["parts"][number]): p is ToolUIPart => p.type.startsWith("tool-");

export function read(messages: UIMessage[]) {
  const parts = messages.flatMap((m) => (m.role === "assistant" ? m.parts.filter(isTool) : []));
  const steps = parts.filter((p) => stepName(p) in stepKinds);
  const last = steps.at(-1);
  return {
    steps,
    pending: last?.state === "input-available" ? last : undefined,
    ended: parts.some((p) => p.type === "tool-endLesson" && p.state === "output-available"),
    feedbackFor(step: ToolUIPart): Feedback | undefined {
      const fb = parts.slice(parts.indexOf(step) + 1).find((p) => p.type === "tool-giveFeedback");
      if (fb?.state !== "output-available") return;
      const input = fb.input as Feedback;
      return { ...input, verdict: (fb.output as Partial<Feedback>)?.verdict ?? input.verdict };
    },
  };
}

export function displayAnswer(type: string, input: any, answer: string): string {
  if (type !== "fillGaps" && type !== "reorder") return answer;
  try {
    const values = JSON.parse(answer);
    if (type === "reorder") return values.map((i: number) => input.items[i]).join(" ");
    let i = 0;
    return input.sentence.replace(/_{2,}/g, () => values[i++]);
  } catch {
    return answer;
  }
}
