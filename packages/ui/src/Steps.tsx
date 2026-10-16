import { Progress } from "@base-ui/react/progress";
import { cva } from "class-variance-authority";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { ChoiceChips } from "./ChoiceChips";
import { Heading } from "./Heading";
import { labelledBarParts } from "./ProgressBar";
import { Text } from "./Text";
import { TextArea } from "./TextArea";
import { TextField } from "./TextField";
import { VerdictTag, type VerdictTagProps } from "./VerdictTag";

// The Step parts shared by the Lesson player and the Written Assessment.
// Step props use the backend's Step tool input names, so apps pass `{...step.input}` straight through.

const header = cva("flex flex-col gap-3");
const bar = cva("flex flex-col gap-2");
const label = cva("text-label uppercase text-ink");

export type StepHeaderProps = {
  /** The kind of Step, for example "Rewrite". */
  type: string;
  question: string;
  /**
   * Where the Step sits in a Lesson, shown as "Rewrite · Step 4 of ~7" with a progress bar.
   * Lessons adapt, so `total` reads as an estimate. Without it only the type is shown.
   */
  progress?: { position: number; total: number };
};

/** The top of every Step: its type (and in a Lesson, its position and progress), then the question. */
export function StepHeader({ type, question, progress }: StepHeaderProps) {
  return (
    <div className={header()}>
      {progress ? (
        <Progress.Root value={progress.position - 1} max={progress.total} className={bar()}>
          <Progress.Label className={label()}>{`${type} · Step ${progress.position} of ~${progress.total}`}</Progress.Label>
          <Progress.Track className={labelledBarParts.track()}>
            <Progress.Indicator className={labelledBarParts.indicator()} />
          </Progress.Track>
        </Progress.Root>
      ) : (
        <Text size="label" tone="muted">
          {type}
        </Text>
      )}
      <Heading level={2} size="title">
        {question}
      </Heading>
    </div>
  );
}

const form = cva("flex flex-col gap-4");
const stack = cva("flex flex-col gap-6");
const quote = cva("rounded-md bg-subtle px-4 py-3 text-body text-ink");

/** What every Step's answer shares. */
type Answerable = {
  /** Called with the Learner's answer, trimmed and never empty. */
  onAnswer: (answer: string) => void;
  /** While the answer is being sent, so it can't be sent twice. */
  pending?: boolean;
  /** The Learner's answer once it's been sent. The Step then shows it read-only, without a verdict. */
  answered?: string;
};

// The answer so far, and a submit handler that sends it trimmed, once, and never empty.
function useAnswer({ onAnswer, pending }: Answerable) {
  const [answer, setAnswer] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending && answer.trim()) onAnswer(answer.trim());
  };
  return { answer, setAnswer, submit };
}

function SendButton({ pending, answer }: { pending?: boolean; answer: string }) {
  return (
    <div>
      <Button type="submit" disabled={pending || !answer.trim()}>
        Send answer
      </Button>
    </div>
  );
}

export type AnswerBoxProps = Answerable & {
  /** @default "Your answer" */
  label?: string;
};

/** A written answer and its send button. Steps use it, and so can any Step answered in text. */
export function AnswerBox({ label = "Your answer", ...props }: AnswerBoxProps) {
  const { answer, setAnswer, submit } = useAnswer(props);
  if (props.answered !== undefined) return <Text>{props.answered}</Text>;
  return (
    <form className={form()} onSubmit={submit}>
      <TextArea label={label} value={answer} onValueChange={setAnswer} maxLength={2000} />
      <SendButton pending={props.pending} answer={answer} />
    </form>
  );
}

export type RewriteStepProps = Answerable & {
  /** The sentence to improve. */
  sentence: string;
};

/** A rewrite Step: the original sentence quoted, then the Learner's version. Its aim is the StepHeader question. */
export function RewriteStep({ sentence, onAnswer, pending, answered }: RewriteStepProps) {
  return (
    <div className={stack()}>
      <blockquote className={quote()}>{sentence}</blockquote>
      <AnswerBox label="Your version" onAnswer={onAnswer} pending={pending} answered={answered} />
    </div>
  );
}

const word = cva("flex flex-col gap-2");

export type VocabCardStepProps = Answerable & {
  word: string;
  meaning: string;
  /** An example sentence using the word. */
  example: string;
};

/** A vocabCard Step: the word on a card with its meaning and an example, then the Learner's own sentence. */
export function VocabCardStep({ word: w, meaning, example, onAnswer, pending, answered }: VocabCardStepProps) {
  return (
    <div className={stack()}>
      <Card>
        <div className={word()}>
          <Heading level={3} size="heading">
            {w}
          </Heading>
          <Text>{meaning}</Text>
          <Text tone="muted">{example}</Text>
        </div>
      </Card>
      <AnswerBox label="Your sentence" onAnswer={onAnswer} pending={pending} answered={answered} />
    </div>
  );
}

const sentenceText = cva("text-title text-ink");
const gap = cva("inline-block min-w-14 rounded-sm border-b-2 border-line bg-subtle px-2 text-center text-ink");

export type FillGapStepProps = Answerable & {
  /** The sentence, with the gap written as ___. */
  sentence: string;
  /** Large chips to pick from. Without them the Learner types the missing words. */
  choices?: string[];
};

/** A fillGap Step: the sentence with the gap as a slot that shows the Learner's answer. It never shows the answer key. */
export function FillGapStep({ sentence, choices, ...props }: FillGapStepProps) {
  const { answer, setAnswer, submit } = useAnswer(props);
  const [before, after = ""] = sentence.split(/_{2,}/, 2);
  const filled = (props.answered ?? answer).trim();
  return (
    <form className={form()} onSubmit={submit}>
      <p className={sentenceText()}>
        {before}
        <mark className={gap()}>{filled || <span className="sr-only">blank</span>}</mark>
        {after}
      </p>
      {props.answered === undefined && (
        <>
          {choices?.length ? (
            <ChoiceChips
              label="Pick the missing words"
              options={choices.map((c) => ({ value: c, label: c }))}
              value={answer || null}
              onValueChange={setAnswer}
            />
          ) : (
            <TextField label="Your answer" value={answer} onValueChange={setAnswer} maxLength={2000} autoComplete="off" />
          )}
          <SendButton pending={props.pending} answer={answer} />
        </>
      )}
    </form>
  );
}

const panel = cva("flex flex-col items-start gap-3 rounded-md border-2 border-line p-5 text-ink", {
  variants: {
    verdict: { correct: "bg-correct-tint", almost: "bg-almost-tint", incorrect: "bg-incorrect-tint" },
  },
});
const corrected = cva("text-body font-bold");

export type StepFeedbackProps = {
  verdict: VerdictTagProps["verdict"];
  /** The Learner's answer, to compare with the corrected version. */
  answer?: string;
  corrected: string;
  /** One sentence on why. Left out when empty. */
  explanation: string;
  onNext: () => void;
  /** @default "Next step" */
  nextLabel?: string;
};

/** The feedback on an answered Step: the verdict as a word on its tint, the corrected version and why. */
export function StepFeedback({ verdict, answer, corrected: fixed, explanation, onNext, nextLabel = "Next step" }: StepFeedbackProps) {
  return (
    <div role="status" className={panel({ verdict })}>
      <VerdictTag verdict={verdict} />
      {answer && <Text tone="muted">{`You wrote: ${answer}`}</Text>}
      <strong className={corrected()}>{fixed}</strong>
      {explanation && <Text size="caption">{explanation}</Text>}
      <Button onClick={onNext}>{nextLabel}</Button>
    </div>
  );
}

const turn = cva("max-w-prose text-body text-ink", {
  variants: {
    from: { coach: "self-start", learner: "self-end rounded-md bg-subtle px-4 py-2" },
  },
});

export type ChatTurnProps = {
  from: "coach" | "learner";
  children: ReactNode;
};

/** One line of a written conversation with the coach. Place turns in a Stack; the Learner's sit on the right. */
export function ChatTurn({ from, children }: ChatTurnProps) {
  return (
    <p className={turn({ from })}>
      <span className="sr-only">{from === "coach" ? "Coach: " : "You: "}</span>
      {children}
    </p>
  );
}
