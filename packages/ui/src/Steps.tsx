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

const header = cva("flex flex-col gap-3");
const bar = cva("flex flex-col gap-2");
const label = cva("text-label uppercase text-ink");

export type StepHeaderProps = {
  type: string;
  question: string;
  progress?: { position: number; total: number };
};

function StepProgress({ type, position, total }: { type: string; position: number; total: number }) {
  return (
    <Progress.Root value={position - 1} max={total} className={bar()}>
      <Progress.Label className={label()}>{`${type} · Step ${position} of ~${total}`}</Progress.Label>
      <Progress.Track className={labelledBarParts.track()}>
        <Progress.Indicator className={labelledBarParts.indicator()} />
      </Progress.Track>
    </Progress.Root>
  );
}

export function StepHeader({ type, question, progress }: StepHeaderProps) {
  const lead = progress ? (
    <StepProgress type={type} {...progress} />
  ) : (
    <Text size="label" tone="muted">
      {type}
    </Text>
  );
  return (
    <div className={header()}>
      {lead}
      <Heading level={2} size="title">
        {question}
      </Heading>
    </div>
  );
}

const form = cva("flex flex-col gap-4");
const stack = cva("flex flex-col gap-6");
const quote = cva("rounded-xl bg-subtle px-4 py-3 text-body text-ink");

type Answerable = {
  onAnswer: (answer: string) => void;
  pending?: boolean;
  answered?: string;
};

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

function BlankButton({
  index,
  value,
  active,
  disabled,
  onSelect,
}: {
  index: number;
  value: string;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Blank ${index + 1}: ${value || "empty"}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onSelect}
      className="mx-1 inline-block min-h-11 min-w-16 rounded-lg border border-dashed border-line-strong bg-subtle px-2 text-ink aria-pressed:border-primary aria-pressed:bg-primary-soft"
    >
      {value || <span aria-hidden>…</span>}
    </button>
  );
}

function GapChoices({
  choices,
  active,
  disabled,
  onPick,
}: {
  choices: string[];
  active: number;
  disabled?: boolean;
  onPick: (choice: string) => void;
}) {
  return (
    <>
      <Text size="caption" tone="muted">
        Choose words for blank {active + 1}. Select a blank to change it.
      </Text>
      <div className="flex flex-wrap gap-3">
        {choices.map((choice, i) => (
          <Button key={i} type="button" variant="secondary" disabled={disabled} onClick={() => onPick(choice)}>
            {choice}
          </Button>
        ))}
      </div>
    </>
  );
}

export function FillGapsStep({ sentence, choices, ...props }: FillGapsStepProps) {
  const parts = sentence.split(/_{2,}/);
  const [values, setValues] = useState<string[]>(() =>
    props.answered ? JSON.parse(props.answered) : Array(parts.length - 1).fill(""),
  );
  const [active, setActive] = useState(0);
  const locked = props.answered !== undefined || props.pending;
  const complete = values.every((v) => v.trim());
  function fill(index: number, value: string) {
    if (locked) return;
    setValues((previous) => previous.map((v, n) => (n === index ? value : v)));
  }
  const sentenceParts = parts.map((part, i) => {
    const blank =
      i < parts.length - 1 ? (
        <BlankButton
          index={i}
          value={values[i] ?? ""}
          active={active === i}
          disabled={locked}
          onSelect={() => setActive(i)}
        />
      ) : null;
    return (
      <span key={i}>
        {part}
        {blank}
      </span>
    );
  });
  const entry = choices?.length ? (
    <GapChoices
      choices={choices}
      active={active}
      disabled={locked}
      onPick={(choice) => {
        fill(active, choice);
        setActive((active + 1) % values.length);
      }}
    />
  ) : (
    values.map((value, i) => (
      <TextField
        key={i}
        label={`Blank ${i + 1}`}
        value={value}
        onValueChange={(v) => fill(i, v)}
        disabled={locked}
        maxLength={200}
      />
    ))
  );
  const answering =
    props.answered === undefined ? (
      <div className="mt-auto flex flex-col gap-4 pt-10">
        {entry}
        <SendButton pending={props.pending} answer={complete ? JSON.stringify(values) : ""} />
      </div>
    ) : null;
  return (
    <form
      className={form()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!locked && complete) props.onAnswer(JSON.stringify(values.map((v) => v.trim())));
      }}
    >
      <p className="text-title leading-loose text-ink">{sentenceParts}</p>
      {answering}
    </form>
  );
}

export type ReorderStepProps = Answerable & { items: string[] };

type ReorderRowProps = {
  index: number;
  count: number;
  label: string;
  locked?: boolean;
  showMoves: boolean;
  register: (node: HTMLLIElement | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMove: (to: number) => void;
};

function ReorderRow({
  index,
  count,
  label,
  locked,
  showMoves,
  register,
  onDragStart,
  onDragEnd,
  onDrop,
  onMove,
}: ReorderRowProps) {
  const moves = showMoves ? (
    <div className="flex shrink-0 gap-1">
      <IconButton
        icon={ArrowUp}
        label={`Move ${label} up`}
        disabled={locked || index === 0}
        onClick={() => onMove(index - 1)}
      />
      <IconButton
        icon={ArrowDown}
        label={`Move ${label} down`}
        disabled={locked || index === count - 1}
        onClick={() => onMove(index + 1)}
      />
    </div>
  ) : null;
  return (
    <li
      ref={register}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      className="flex items-center gap-3 rounded-xl border border-line-strong bg-paper p-3 text-body text-ink"
    >
      <span
        draggable={!locked}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(index));
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        className="cursor-grab text-muted"
      >
        <DotsSixVertical aria-hidden />
      </span>
      <span className="text-caption tabular-nums text-muted">{index + 1}</span>
      <span className="min-w-0 flex-1">{label}</span>
      {moves}
    </li>
  );
}

export function ReorderStep({ items, ...props }: ReorderStepProps) {
  const [order, setOrder] = useState<number[]>(() =>
    props.answered ? JSON.parse(props.answered) : items.map((_, i) => i),
  );
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
  const unanswered = props.answered === undefined;
  function move(from: number, to: number) {
    if (locked || to < 0 || to >= order.length || from === to) return;
    moved.current = order[from];
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    setOrder(next);
    setAnnouncement(`${items[order[from]!]} moved to position ${to + 1}`);
  }
  const rowList = order.map((item, index) => (
    <ReorderRow
      key={item}
      index={index}
      count={order.length}
      label={items[item]!}
      locked={locked}
      showMoves={unanswered}
      register={(node) => {
        if (node) rows.current.set(item, node);
        else rows.current.delete(item);
      }}
      onDragStart={() => setDragging(index)}
      onDragEnd={() => setDragging(undefined)}
      onDrop={() => {
        if (dragging !== undefined) move(dragging, index);
        setDragging(undefined);
      }}
      onMove={(to) => move(index, to)}
    />
  ));
  return (
    <form
      className={form()}
      onSubmit={(e) => {
        e.preventDefault();
        if (!locked) props.onAnswer(JSON.stringify(order));
      }}
    >
      <Text size="caption" tone="muted">
        Drag to arrange, or use the up and down buttons.
      </Text>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <ol className="flex flex-col gap-3">{rowList}</ol>
      {unanswered && <SendButton pending={props.pending} answer={JSON.stringify(order)} />}
    </form>
  );
}

export type AnswerBoxProps = Answerable & {
  label?: string;
};

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
  sentence: string;
};

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
  example: string;
  onHearIt?: () => void;
  voice?: VoiceProps;
};

export function VocabCardStep({ word: w, meaning, example, onHearIt, voice, ...answer }: VocabCardStepProps) {
  const reply = voice ? (
    <VoiceAnswer label="Your sentence" prefer="text" {...voice} {...answer} />
  ) : (
    <AnswerBox label="Your sentence" {...answer} />
  );
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
      {reply}
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
  sentence: string;
  choices?: string[];
};

export function FillGapStep({ sentence, choices, ...props }: FillGapStepProps) {
  const { answer, setAnswer, submit } = useAnswer(props);
  const [before, after = ""] = sentence.split(/_{2,}/, 2);
  const filled = (props.answered ?? answer).trim();
  const entry = choices?.length ? (
    <ChoiceChips
      label="Pick the missing words"
      options={choices.map((c) => ({ value: c, label: c }))}
      value={answer || null}
      onValueChange={setAnswer}
    />
  ) : (
    <TextField label="Your answer" value={answer} onValueChange={setAnswer} maxLength={2000} autoComplete="off" />
  );
  const answering =
    props.answered === undefined ? (
      <>
        {entry}
        <SendButton pending={props.pending} answer={answer} />
      </>
    ) : null;
  return (
    <form className={form()} onSubmit={submit}>
      <p className={sentenceText()}>
        {before}
        <mark className={gap()}>{filled || <span className="sr-only">blank</span>}</mark>
        {after}
      </p>
      {answering}
    </form>
  );
}

const panel = cva(
  "sticky bottom-0 z-sticky mt-auto flex flex-col items-stretch gap-5 rounded-2xl border border-line p-6 text-ink shadow-card transition duration-ui ease-press starting:opacity-0 motion-safe:starting:translate-y-2",
  {
    variants: {
      verdict: { correct: "bg-correct-tint", almost: "bg-almost-tint", incorrect: "bg-incorrect-tint" },
    },
  },
);
const corrected = cva("text-body font-bold");
const actions = cva("flex flex-wrap gap-3 [&>button:last-child]:flex-1");

export type StepFeedbackProps = {
  verdict: VerdictTagProps["verdict"];
  answer?: string;
  spoken?: boolean;
  corrected: string;
  explanation: string;
  onNext: () => void;
  nextLabel?: string;
  onHearIt?: () => void;
};

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

export type RecordingState =
  | { status: "idle" }
  | { status: "recording"; seconds: number; level: number }
  | { status: "processing" }
  | { status: "done"; text: string }
  | { status: "failed"; reason: "failed" | "silent" }
  | { status: "unavailable"; reason: "capped" | "denied" | "no-microphone" | "unsupported" };

export type VoiceProps = {
  recording: RecordingState;
  onStart: () => void;
  onStop: () => void;
  onRetry: () => void;
};

const unavailable: Record<Extract<RecordingState, { status: "unavailable" }>["reason"], string> = {
  capped: "You've used today's recorded minutes. Answer in text for now; recording opens again tomorrow.",
  denied:
    "Impromptu isn't allowed to use your microphone. Allow it in your browser's site settings to record, or answer in text.",
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
    label?: string;
    prefer?: "voice" | "text";
    hint?: ReactNode;
    targetSeconds?: number;
  };

function RecordingFailed({ reason, onRetry }: { reason: "failed" | "silent"; onRetry: () => void }) {
  const message =
    reason === "silent" ? (
      "We couldn't hear anything in that recording. Check your microphone and record again."
    ) : (
      <span className={problem()}>
        Your recording couldn't be turned into text.
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </span>
    );
  return <Notice tone="error">{message}</Notice>;
}

function RecordingLive({
  seconds,
  level: micLevel,
  targetSeconds,
}: {
  seconds: number;
  level: number;
  targetSeconds?: number;
}) {
  const time = targetSeconds ? `${clock(seconds)} / ${clock(targetSeconds)}` : clock(seconds);
  return (
    <div className={live()}>
      <p role="status" className={liveLabel()}>
        Recording
      </p>
      <span className={timer()}>{time}</span>
      <Meter.Root value={Math.round(micLevel * 100)} aria-label="Microphone level" className={level()}>
        <Meter.Track className={levelTrack()}>
          <Meter.Indicator className={levelBar()} />
        </Meter.Track>
      </Meter.Root>
    </div>
  );
}

export function VoiceAnswer({
  recording,
  onStart,
  onStop,
  onRetry,
  label,
  prefer = "voice",
  hint,
  targetSeconds,
  ...answer
}: VoiceAnswerProps) {
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
  const idle = state === "idle";
  const failure =
    recording.status === "failed" ? <RecordingFailed reason={recording.reason} onRetry={onRetry} /> : null;
  const liveBar =
    recording.status === "recording" ? (
      <RecordingLive seconds={recording.seconds} level={recording.level} targetSeconds={targetSeconds} />
    ) : null;
  return (
    <div className={recorder()}>
      {failure}
      {idle && hint}
      <RecordButton state={state} onStart={onStart} onStop={onStop} />
      {liveBar}
      {recording.status === "processing" && <p role="status">Turning your answer into text</p>}
      {idle && <TextLink onClick={() => setTyping(true)}>Type instead</TextLink>}
    </div>
  );
}

export type SpeakPromptStepProps = Omit<VoiceAnswerProps, "hint" | "prefer" | "targetSeconds"> & {
  targetSeconds: number;
};

export function SpeakPromptStep({ targetSeconds, ...props }: SpeakPromptStepProps) {
  return (
    <VoiceAnswer
      {...props}
      targetSeconds={targetSeconds}
      hint={<Text tone="muted">{`Aim for about ${targetSeconds} seconds`}</Text>}
    />
  );
}

const turn = cva("max-w-prose whitespace-pre-wrap text-body text-ink", {
  variants: {
    from: {
      coach: "self-start rounded-2xl rounded-tl-sm border border-line bg-paper px-5 py-4",
      learner: "self-end rounded-2xl rounded-tr-sm bg-primary-soft px-5 py-4",
    },
  },
});

const caret = cva("ml-0.5 inline-block h-5 w-0.5 translate-y-1 rounded-full bg-primary motion-safe:animate-blink");

export type ChatTurnProps = {
  from: "coach" | "learner";
  name?: string;
  streaming?: boolean;
  children: ReactNode;
};

export function ChatTurn({
  from,
  name = from === "coach" ? "Coach" : "You",
  streaming = false,
  children,
}: ChatTurnProps) {
  return (
    <p className={turn({ from })} aria-busy={streaming || undefined}>
      <span className="sr-only">{`${name}: `}</span>
      {children}
      {streaming && <span aria-hidden className={caret()} />}
    </p>
  );
}
