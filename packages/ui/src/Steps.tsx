import { cva } from "class-variance-authority";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { ChoiceChips } from "./ChoiceChips";
import { Heading } from "./Heading";
import { Text } from "./Text";
import { TextArea } from "./TextArea";
import { TextField } from "./TextField";

// The parts every Step shares. Props use the backend's Step tool input names (`sentence`, `choices`, `aim`).

export type StepHeaderProps = {
  /** For example "Rewrite · Step 4 of ~7". */
  label: string;
  question: string;
};

/** The label and question at the top of every Step. */
export function StepHeader({ label, question }: StepHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <Text size="label" tone="muted">
        {label}
      </Text>
      <Heading level={2} size="title">
        {question}
      </Heading>
    </div>
  );
}

type AnswerProps = {
  /** The Learner's answer once it's been sent. The Step then shows it read-only, without a verdict. */
  answered?: string;
  /** While the answer is being sent. */
  pending?: boolean;
  onAnswer: (answer: string) => void;
};

/** The answer form: an input and the send button, which waits for a non-empty answer. */
function AnswerForm({ value, pending, onAnswer, children }: { value: string; pending?: boolean; onAnswer: (a: string) => void; children: ReactNode }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value.trim() && !pending) onAnswer(value.trim());
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {children}
      <Button type="submit" disabled={pending || !value.trim()}>
        Send answer
      </Button>
    </form>
  );
}

const step = cva("flex flex-col gap-5");
const gap = cva("inline-block min-w-14 rounded-sm border-b-2 border-line bg-subtle px-2 text-center text-ink");

export type FillGapStepProps = AnswerProps & {
  label: string;
  /** The sentence, with the gap written as `___`. */
  sentence: string;
  /** Shown as chips to pick from; without them the Learner types the missing words. */
  choices?: string[];
};

/** A sentence with one gap. It never shows whether the answer is right; the app decides what follows. */
export function FillGapStep({ label, sentence, choices, answered, pending, onAnswer }: FillGapStepProps) {
  const [value, setValue] = useState("");
  const [before, after] = sentence.split(/_{2,}/);
  const filled = answered ?? value;
  return (
    <div className={step()}>
      <StepHeader label={label} question="Complete the sentence." />
      <p className="text-title text-ink">
        {before}
        <mark className={gap()}>{filled || <span className="sr-only">blank</span>}</mark>
        {after}
      </p>
      {answered === undefined && (
        <AnswerForm value={value} pending={pending} onAnswer={onAnswer}>
          {choices?.length ? (
            <ChoiceChips label="Choices" options={choices.map((c) => ({ value: c, label: c }))} value={value || null} onValueChange={setValue} />
          ) : (
            <TextField label="Your answer" value={value} onValueChange={setValue} autoComplete="off" />
          )}
        </AnswerForm>
      )}
    </div>
  );
}

const quote = cva("rounded-md bg-subtle px-4 py-3 text-body text-ink");

export type RewriteStepProps = AnswerProps & {
  label: string;
  /** The sentence to improve. */
  sentence: string;
  /** What to aim for, shown as the question. */
  aim: string;
};

/** A sentence to rewrite: the original quoted, then the Learner's version. */
export function RewriteStep({ label, sentence, aim, answered, pending, onAnswer }: RewriteStepProps) {
  const [value, setValue] = useState("");
  return (
    <div className={step()}>
      <StepHeader label={label} question={aim} />
      <blockquote className={quote()}>{sentence}</blockquote>
      {answered === undefined ? (
        <AnswerForm value={value} pending={pending} onAnswer={onAnswer}>
          <TextArea label="Your version" value={value} onValueChange={setValue} rows={3} />
        </AnswerForm>
      ) : (
        <Text>{answered}</Text>
      )}
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
