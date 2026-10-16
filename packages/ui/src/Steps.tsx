import { Progress } from "@base-ui/react/progress";
import { cva } from "class-variance-authority";
import { useState, type FormEvent } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { ChoiceChips } from "./ChoiceChips";
import { Heading } from "./Heading";
import { labelledBarParts } from "./ProgressBar";
import { Text } from "./Text";
import { TextArea } from "./TextArea";
import { TextField } from "./TextField";
import { VerdictTag, type VerdictTagProps } from "./VerdictTag";

const header = cva("flex flex-col gap-3");
const bar = cva("flex flex-col gap-2");
const label = cva("text-label uppercase text-ink");

export type StepHeaderProps = {
  /** The kind of Step, for example "Rewrite". */
  type: string;
  /** This Step's number, from 1. */
  position: number;
  /** About how many Steps the Lesson has. Lessons adapt, so it reads as an estimate ("of ~7"). */
  total: number;
  question: string;
};

/** The top of every Step: its type, position and progress, then the question. */
export function StepHeader({ type, position, total, question }: StepHeaderProps) {
  return (
    <div className={header()}>
      <Progress.Root value={position - 1} max={total} className={bar()}>
        <Progress.Label className={label()}>
          {`${type} · Step ${position} of ~${total}`}
        </Progress.Label>
        <Progress.Track className={labelledBarParts.track()}>
          <Progress.Indicator className={labelledBarParts.indicator()} />
        </Progress.Track>
      </Progress.Root>
      <Heading level={1} size="title">
        {question}
      </Heading>
    </div>
  );
}

const form = cva("flex flex-col gap-4");
const stack = cva("flex flex-col gap-6");
const quote = cva("rounded-md bg-subtle p-4 text-body text-ink");

/** What every Step's answer form shares: `pending` while the answer is being checked, so it can't be sent twice. */
type Answerable = {
  /** Called with the Learner's answer, trimmed and never empty. */
  onAnswer: (answer: string) => void;
  pending?: boolean;
};

export type AnswerBoxProps = Answerable & {
  /** @default "Your answer" */
  label?: string;
};

/** A written answer and its "Check" button. Steps use it, and so can any Step answered in text. */
// The answer so far, and a submit handler that sends it trimmed, once, and never empty.
function useAnswer({ onAnswer, pending }: Answerable) {
  const [answer, setAnswer] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pending && answer.trim()) onAnswer(answer.trim());
  };
  return { answer, setAnswer, submit };
}

function CheckButton({ pending }: { pending?: boolean }) {
  return (
    <div>
      <Button type="submit" disabled={pending}>
        Check
      </Button>
    </div>
  );
}

export function AnswerBox({ label = "Your answer", ...props }: AnswerBoxProps) {
  const { answer, setAnswer, submit } = useAnswer(props);
  return (
    <form className={form()} onSubmit={submit}>
      <TextArea label={label} value={answer} onValueChange={setAnswer} maxLength={2000} />
      <CheckButton pending={props.pending} />
    </form>
  );
}

export type RewriteStepProps = Answerable & {
  /** The sentence to improve. */
  sentence: string;
};

/** A rewrite Step: the original sentence quoted, then the Learner's rewrite. */
export function RewriteStep({ sentence, onAnswer, pending }: RewriteStepProps) {
  return (
    <div className={stack()}>
      <blockquote className={quote()}>{sentence}</blockquote>
      <AnswerBox label="Your rewrite" onAnswer={onAnswer} pending={pending} />
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
export function VocabCardStep({ word: w, meaning, example, onAnswer, pending }: VocabCardStepProps) {
  return (
    <div className={stack()}>
      <Card>
        <div className={word()}>
          <Heading level={2} size="heading">
            {w}
          </Heading>
          <Text>{meaning}</Text>
          <Text tone="muted">{example}</Text>
        </div>
      </Card>
      <AnswerBox label="Your sentence" onAnswer={onAnswer} pending={pending} />
    </div>
  );
}

const sentenceText = cva("text-title text-ink");
const gap = cva("inline-block min-w-14 border-b-2 border-primary px-2 text-center text-primary");

export type FillGapStepProps = Answerable & {
  /** The sentence, with the gap written as ___. */
  sentence: string;
  /** Large chips to pick from. Without them the Learner types the missing word. */
  choices?: string[];
};

/** A fillGap Step: the sentence with the gap as an underlined slot that shows the Learner's answer. */
export function FillGapStep({ sentence, choices, ...props }: FillGapStepProps) {
  const { answer, setAnswer, submit } = useAnswer(props);
  const [before, after = ""] = sentence.split(/_{2,}/, 2);
  return (
    <form className={form()} onSubmit={submit}>
      <p className={sentenceText()}>
        {before}
        <span className={gap()}>{answer.trim() || <span className="sr-only">blank</span>}</span>
        {after}
      </p>
      {choices?.length ? (
        <ChoiceChips
          label="Pick the missing word"
          options={choices.map((c) => ({ value: c, label: c }))}
          value={answer || null}
          onValueChange={setAnswer}
        />
      ) : (
        <TextField label="Your answer" value={answer} onValueChange={setAnswer} maxLength={2000} autoComplete="off" />
      )}
      <CheckButton pending={props.pending} />
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
