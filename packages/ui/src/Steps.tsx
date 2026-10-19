import { Meter } from "@base-ui/react/meter";
import { Progress } from "@base-ui/react/progress";
import { ArrowDown, ArrowUp, DotsSixVertical, SpeakerHigh } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { Card } from "./Card";
import { ChoiceChips } from "./ChoiceChips";
import { Heading } from "./Heading";
import { IconButton } from "./IconButton";
import { Notice } from "./Notice";
import { labelledBarParts } from "./ProgressBar";
import { RecordButton } from "./RecordButton";
import { Text } from "./Text";
import { TextArea } from "./TextArea";
import { TextField } from "./TextField";
import { TextLink } from "./TextLink";
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
const quote = cva("rounded-xl bg-subtle px-4 py-3 text-body text-ink");

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
    <div className="mt-6 w-full">
      <Button type="submit" fullWidth disabled={pending || !answer.trim()}>
        Send answer
      </Button>
    </div>
  );
}

export type FillGapsStepProps = Answerable & { sentence: string; choices?: string[] };

export function FillGapsStep({ sentence, choices, ...props }: FillGapsStepProps) {
  const parts = sentence.split(/_{2,}/);
  const [values, setValues] = useState<string[]>(() => props.answered ? JSON.parse(props.answered) : Array(parts.length - 1).fill(""));
  const [active, setActive] = useState(0);
  const locked = props.answered !== undefined || props.pending;
  const complete = values.every((v) => v.trim());
  function fill(index: number, value: string) {
    if (locked) return;
    setValues((previous) => previous.map((v, n) => n === index ? value : v));
  }
  return (
    <form className={form()} onSubmit={(e) => { e.preventDefault(); if (!locked && complete) props.onAnswer(JSON.stringify(values.map((v) => v.trim()))); }}>
      <p className="text-title leading-loose text-ink">{parts.map((part, i) => <span key={i}>{part}{i < parts.length - 1 && (
        <button type="button" aria-label={`Blank ${i + 1}: ${values[i] || "empty"}`} aria-pressed={active === i} disabled={locked} onClick={() => setActive(i)}
          className="mx-1 inline-block min-h-11 min-w-16 rounded-lg border border-dashed border-line-strong bg-subtle px-2 text-ink aria-pressed:border-primary aria-pressed:bg-primary-soft">{values[i] || <span aria-hidden>…</span>}</button>
      )}</span>)}</p>
      {props.answered === undefined && <div className="mt-auto flex flex-col gap-4 pt-10">
        {choices?.length ? <><Text size="caption" tone="muted">Choose words for blank {active + 1}. Select a blank to change it.</Text><div className="flex flex-wrap gap-3">{choices.map((choice, i) => <Button key={i} type="button" variant="secondary" disabled={locked} onClick={() => { fill(active, choice); setActive((active + 1) % values.length); }}>{choice}</Button>)}</div></>
          : values.map((value, i) => <TextField key={i} label={`Blank ${i + 1}`} value={value} onValueChange={(v) => fill(i, v)} disabled={locked} maxLength={200} />)}
        <SendButton pending={props.pending} answer={complete ? JSON.stringify(values) : ""} />
      </div>}
    </form>
  );
}

export type ReorderStepProps = Answerable & { items: string[] };

export function ReorderStep({ items, ...props }: ReorderStepProps) {
  const [order, setOrder] = useState<number[]>(() => props.answered ? JSON.parse(props.answered) : items.map((_, i) => i));
  const [dragging, setDragging] = useState<number>();
  const [announcement, setAnnouncement] = useState("");
  const rows = useRef(new Map<number, HTMLLIElement>());
  const moved = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (moved.current === undefined) return;
    rows.current.get(moved.current)?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    moved.current = undefined;
  }, [order]);
  const locked = props.pending || props.answered !== undefined;
  function move(from: number, to: number) {
    if (locked || to < 0 || to >= order.length || from === to) return;
    moved.current = order[from];
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setOrder(next);
    setAnnouncement(`${items[order[from]!]} moved to position ${to + 1}`);
  }
  return (
    <form className={form()} onSubmit={(e) => { e.preventDefault(); if (!locked) props.onAnswer(JSON.stringify(order)); }}>
      <Text size="caption" tone="muted">Drag to arrange, or use the up and down buttons.</Text>
      <p role="status" className="sr-only">{announcement}</p>
      <ol className="flex flex-col gap-3">{order.map((item, index) => (
        <li key={item} ref={(node) => { if (node) rows.current.set(item, node); else rows.current.delete(item); }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (dragging !== undefined) move(dragging, index); setDragging(undefined); }}
          className="flex items-center gap-3 rounded-xl border border-line-strong bg-paper p-3 text-body text-ink">
          <span draggable={!locked} onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(index)); setDragging(index); }} onDragEnd={() => setDragging(undefined)} className="cursor-grab text-muted"><DotsSixVertical aria-hidden /></span>
          <span className="text-caption tabular-nums text-muted">{index + 1}</span><span className="min-w-0 flex-1">{items[item]}</span>
          {props.answered === undefined && <div className="flex shrink-0 gap-1"><IconButton icon={ArrowUp} label={`Move ${items[item]} up`} disabled={locked || index === 0} onClick={() => move(index, index - 1)} /><IconButton icon={ArrowDown} label={`Move ${items[item]} down`} disabled={locked || index === order.length - 1} onClick={() => move(index, index + 1)} /></div>}
        </li>
      ))}</ol>
      {props.answered === undefined && <SendButton pending={props.pending} answer={JSON.stringify(order)} />}
    </form>
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

const word = cva("flex flex-col items-start gap-2");

export type VocabCardStepProps = Answerable & {
  word: string;
  meaning: string;
  /** An example sentence using the word. */
  example: string;
  /** Plays the word's Reference Pronunciation. Without it there's no "Hear it" button. */
  onHearIt?: () => void;
  /** Lets the Learner record their sentence instead of typing it. */
  voice?: VoiceProps;
};

/** A vocabCard Step: the word on a card with its meaning and an example, then the Learner's own sentence. */
export function VocabCardStep({ word: w, meaning, example, onHearIt, voice, ...answer }: VocabCardStepProps) {
  return (
    <div className={stack()}>
      <Card>
        <div className={word()}>
          <Heading level={3} size="heading">
            {w}
          </Heading>
          {onHearIt && <HearIt onClick={onHearIt} />}
          <Text>{meaning}</Text>
          <Text tone="muted">{example}</Text>
        </div>
      </Card>
      {voice ? (
        <VoiceAnswer label="Your sentence" prefer="text" {...voice} {...answer} />
      ) : (
        <AnswerBox label="Your sentence" {...answer} />
      )}
    </div>
  );
}

function HearIt({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="secondary" icon={SpeakerHigh} onClick={onClick}>
      Hear it
    </Button>
  );
}

const sentenceText = cva("text-title text-ink");
const gap = cva("inline-block min-w-14 rounded-lg border-b-2 border-muted bg-subtle px-2 text-center text-ink");

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

const panel = cva("sticky bottom-0 z-sticky mt-auto flex flex-col items-stretch gap-5 rounded-2xl border border-line p-6 text-ink shadow-card", {
  variants: {
    verdict: { correct: "bg-correct-tint", almost: "bg-almost-tint", incorrect: "bg-incorrect-tint" },
  },
});
const corrected = cva("text-body font-bold");
const actions = cva("flex flex-wrap gap-3 [&>button:last-child]:flex-1");

export type StepFeedbackProps = {
  verdict: VerdictTagProps["verdict"];
  /** The Learner's answer, to compare with the corrected version. */
  answer?: string;
  /** The answer was recorded, so it's quoted as what the Learner said. */
  spoken?: boolean;
  corrected: string;
  /** One sentence on why. Left out when empty. */
  explanation: string;
  onNext: () => void;
  /** @default "Next step" */
  nextLabel?: string;
  /** Plays the corrected version's Reference Pronunciation. Without it there's no "Hear it" button. */
  onHearIt?: () => void;
};

/** The feedback on an answered Step: the verdict as a word on its tint, the corrected version and why. */
export function StepFeedback({
  verdict,
  answer,
  spoken,
  corrected: fixed,
  explanation,
  onNext,
  nextLabel = "Next step",
  onHearIt,
}: StepFeedbackProps) {
  return (
    <div role="status" className={panel({ verdict })}>
      <VerdictTag verdict={verdict} />
      {answer && <Text tone="muted">{`${spoken ? "You said" : "You wrote"}: ${answer}`}</Text>}
      <strong className={corrected()}>{fixed}</strong>
      {explanation && <Text size="caption">{explanation}</Text>}
      <div className={actions()}>
        {onHearIt && <HearIt onClick={onHearIt} />}
        <Button onClick={onNext}>{nextLabel}</Button>
      </div>
    </div>
  );
}

/** Where a recorded answer is. The app's recorder reports it; the component only shows it. */
export type RecordingState =
  | { status: "idle" }
  | { status: "recording"; seconds: number; level: number }
  | { status: "processing" }
  /** The transcript is back. */
  | { status: "done"; text: string }
  /** `failed`: the upload or transcription failed, and can be retried. `silent`: nothing could be heard. */
  | { status: "failed"; reason: "failed" | "silent" }
  /** The Learner answers in text: today's recorded minutes are used up, or there's no microphone to use. */
  | { status: "unavailable"; reason: "capped" | "denied" | "no-microphone" | "unsupported" };

/** A recorder, as a Step takes it. */
export type VoiceProps = {
  recording: RecordingState;
  onStart: () => void;
  onStop: () => void;
  /** Sends the last recording again, after it `failed`. */
  onRetry: () => void;
};

const unavailable: Record<Extract<RecordingState, { status: "unavailable" }>["reason"], string> = {
  capped: "You've used today's recorded minutes. Answer in text for now; recording opens again tomorrow.",
  denied: "Impromptu isn't allowed to use your microphone. Allow it in your browser's site settings to record, or answer in text.",
  "no-microphone": "We couldn't find a microphone to record with. Connect one to record, or answer in text.",
  unsupported: "This browser can't record audio. Answer in text, or try another browser.",
};

const recorder = cva("flex flex-col items-center gap-4 text-center");
const problem = cva("flex flex-col items-start gap-3 text-left");
const live = cva("flex w-full flex-col items-center gap-2");
const liveLabel = cva("text-label uppercase text-live-text");
const timer = cva("text-title tabular-nums text-live-text");
const level = cva("w-full max-w-prose");
const levelTrack = cva("h-2 overflow-hidden rounded-full border border-line bg-subtle");
const levelBar = cva("block h-full bg-live");
const said = cva("flex flex-col gap-2");

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export type VoiceAnswerProps = Answerable &
  VoiceProps & {
    /** The answer box's label, when the Learner types instead. @default "Your answer" */
    label?: string;
    /** Start with the answer box rather than the record button. @default "voice" */
    prefer?: "voice" | "text";
    /** Shown above the record button, for example the target length. */
    hint?: ReactNode;
    /** The length to aim for, shown against the time so far while recording. */
    targetSeconds?: number;
  };

/**
 * An answer the Learner records, with "Type instead". At the recorded-minutes cap, or without a usable
 * microphone, it explains why and switches to text.
 */
export function VoiceAnswer({ recording, onStart, onStop, onRetry, label, prefer = "voice", hint, targetSeconds, ...answer }: VoiceAnswerProps) {
  const [typing, setTyping] = useState(prefer === "text");
  if (answer.answered !== undefined) return <Text>{answer.answered}</Text>;

  if (recording.status === "done")
    return (
      <div className={said()}>
        <Text size="label" tone="muted">
          You said
        </Text>
        <Text>{recording.text}</Text>
      </div>
    );

  if (recording.status === "unavailable")
    return (
      <div className={form()}>
        <Notice tone="info">{unavailable[recording.reason]}</Notice>
        <AnswerBox label={label} {...answer} />
      </div>
    );

  if (typing)
    return (
      <div className={form()}>
        <AnswerBox label={label} {...answer} />
        <div>
          <TextLink onClick={() => setTyping(false)}>Record instead</TextLink>
        </div>
      </div>
    );

  const state = recording.status === "recording" || recording.status === "processing" ? recording.status : "idle";
  return (
    <div className={recorder()}>
      {recording.status === "failed" && (
        <Notice tone="error">
          {recording.reason === "silent" ? (
            "We couldn't hear anything in that recording. Check your microphone and record again."
          ) : (
            <span className={problem()}>
              Your recording couldn't be turned into text.
              <Button variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            </span>
          )}
        </Notice>
      )}
      {state === "idle" && hint}
      <RecordButton state={state} onStart={onStart} onStop={onStop} />
      {recording.status === "recording" && (
        <div className={live()}>
          <p role="status" className={liveLabel()}>
            Recording
          </p>
          <span className={timer()}>{targetSeconds ? `${clock(recording.seconds)} / ${clock(targetSeconds)}` : clock(recording.seconds)}</span>
          <Meter.Root value={Math.round(recording.level * 100)} aria-label="Microphone level" className={level()}>
            <Meter.Track className={levelTrack()}>
              <Meter.Indicator className={levelBar()} />
            </Meter.Track>
          </Meter.Root>
        </div>
      )}
      {recording.status === "processing" && <p role="status">Turning your answer into text</p>}
      {state === "idle" && <TextLink onClick={() => setTyping(true)}>Type instead</TextLink>}
    </div>
  );
}

export type SpeakPromptStepProps = Omit<VoiceAnswerProps, "hint" | "prefer" | "targetSeconds"> & {
  /** How long to aim for. */
  targetSeconds: number;
};

/** A speakPrompt Step: the Learner records a long answer to the StepHeader question, or types instead. */
export function SpeakPromptStep({ targetSeconds, ...props }: SpeakPromptStepProps) {
  return <VoiceAnswer {...props} targetSeconds={targetSeconds} hint={<Text tone="muted">{`Aim for about ${targetSeconds} seconds`}</Text>} />;
}

const turn = cva("max-w-prose whitespace-pre-wrap text-body text-ink", {
  variants: {
    from: { coach: "self-start rounded-2xl rounded-tl-sm border border-line bg-paper px-5 py-4", learner: "self-end rounded-2xl rounded-tr-sm bg-primary-soft px-5 py-4" },
  },
});

export type ChatTurnProps = {
  from: "coach" | "learner";
  /** Who is speaking, for screen readers: the character in a Roleplay, for example "Interviewer". @default "Coach" or "You" */
  name?: string;
  children: ReactNode;
};

/** One line of a written conversation with the coach. Place turns in a Stack; the Learner's sit on the right. */
export function ChatTurn({ from, name = from === "coach" ? "Coach" : "You", children }: ChatTurnProps) {
  return (
    <p className={turn({ from })}>
      <span className="sr-only">{`${name}: `}</span>
      {children}
    </p>
  );
}
