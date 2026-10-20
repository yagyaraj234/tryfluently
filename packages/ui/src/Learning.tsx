import {
  BookOpenText,
  ChatCircleText,
  Check,
  Lock,
  Microphone,
  MicrophoneSlash,
  PhoneDisconnect,
  TextAa,
} from "@phosphor-icons/react";
import { Button as BaseButton } from "@base-ui/react/button";
import { useRender } from "@base-ui/react/use-render";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./Button";
import { Heading } from "./Heading";
import { IconButton } from "./IconButton";
import { ProgressBar } from "./ProgressBar";
import { Text } from "./Text";

export type CoachState = "ready" | "listening" | "thinking" | "speaking";

function CoachMouth({ speaking }: { speaking: boolean }) {
  if (speaking) return <ellipse cx="101" cy="122" rx="9" ry="6" className="fill-ink motion-safe:animate-pulse" />;
  return <path d="M89 119q12 11 24 0" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />;
}

export function CoachAvatar({ state = "ready", small = false }: { state?: CoachState; small?: boolean }) {
  const speaking = state === "speaking";
  const size = small ? "size-12" : "size-48 sm:size-60";
  const ring = speaking ? "motion-safe:animate-bob ring-2 ring-primary ring-offset-8 ring-offset-canvas" : "";
  return (
    <div
      data-state={state}
      className={`${size} group relative shrink-0 rounded-full border border-line bg-primary-soft p-2 ${ring}`}
    >
      <svg viewBox="0 0 200 200" fill="none" aria-hidden className="size-full">
        <circle cx="100" cy="100" r="94" className="fill-primary-soft" />
        <path d="M25 187c5-40 31-58 75-58s70 18 75 58" className="fill-primary stroke-ink" strokeWidth="2" />
        <path d="M82 122v25q18 20 36 0v-25" className="fill-paper stroke-ink" strokeWidth="2" />
        <path
          d="M54 82c0-36 19-58 47-58 33 0 49 22 48 60l-6 26c-5 22-24 36-43 36s-40-16-44-39Z"
          className="fill-paper stroke-ink"
          strokeWidth="2"
        />
        <path
          d="M54 92C37 62 51 25 79 23c18-18 51-4 63 13 11 15 12 38 7 56l-12-31c-27 7-49-1-58-12-4 23-12 33-25 43Z"
          className="fill-ink"
        />
        <path d="M71 84q8-5 16 0m27 0q8-5 16 0" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="80" cy="96" rx="3" ry="4" className="fill-ink" />
        <ellipse cx="121" cy="96" rx="3" ry="4" className="fill-ink" />
        <path d="m100 97-3 13h6" className="stroke-line-strong" strokeWidth="2" strokeLinecap="round" />
        <CoachMouth speaking={speaking} />
        <path
          d="M48 86v23m105-23v23M48 85c-3-55 107-55 105 0m0 24q0 19-27 19"
          className="stroke-muted"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx="124" cy="128" r="5" className="fill-muted" />
      </svg>
    </div>
  );
}

export function StarterShell({
  step,
  title,
  description,
  action,
  children,
}: {
  step: number;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-8 py-2 sm:py-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CoachAvatar small />
          <Text size="caption">Your path starts here</Text>
        </div>
        <div className="flex items-center gap-4">
          <Text size="caption" tone="muted">
            {step} / 3
          </Text>
          {action}
        </div>
      </div>
      <ProgressBar label={`Getting to know you: ${step} of 3`} value={step} max={3} />
      <div className="flex flex-col gap-3">
        <Heading level={1}>{title}</Heading>
        <Text tone="muted">{description}</Text>
      </div>
      {children}
    </div>
  );
}

const stateLabels: Record<CoachState, string> = {
  ready: "Your coach is here",
  listening: "Listening to you",
  thinking: "Your coach is thinking",
  speaking: "Your coach is speaking",
};

function callLabel(connection: "connecting" | "live" | "reconnecting", muted: boolean, state: CoachState) {
  if (connection === "reconnecting") return "Reconnecting…";
  if (connection === "connecting") return "Connecting to your coach…";
  return muted ? "Your microphone is muted" : stateLabels[state];
}

export function CoachCall({
  state,
  connection,
  muted,
  onMutedChange,
  onEnd,
  caption,
  speaker,
  children,
}: {
  state: CoachState;
  connection: "connecting" | "live" | "reconnecting";
  muted: boolean;
  onMutedChange: (value: boolean) => void;
  onEnd: () => void;
  caption?: string;
  speaker?: "coach" | "learner";
  children?: ReactNode;
}) {
  const label = callLabel(connection, muted, state);
  const captionOwner = caption ? (speaker === "learner" ? "You" : "Your coach") : "Live captions";
  const captionText = caption || "Your coach will start. Speak naturally, and interrupt whenever you like.";
  return (
    <section
      aria-label="Voice Assessment with your AI coach"
      className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-between gap-8 py-6 text-center"
    >
      <div className="flex flex-col gap-2">
        <Text size="label" tone="muted">
          Fluently · AI coach
        </Text>
        <Heading level={1} size="title">
          A little conversation. A clearer path.
        </Heading>
        {children}
      </div>
      <div className="flex flex-col items-center gap-8">
        <CoachAvatar state={state} />
        <p role="status" className="text-body font-medium text-ink">
          {label}
        </p>
      </div>
      <div
        aria-live="polite"
        aria-atomic="true"
        className="min-h-24 w-full max-w-prose rounded-2xl border border-line bg-paper p-5 text-left"
      >
        <Text size="caption" tone="muted">
          {captionOwner}
        </Text>
        <Text>{captionText}</Text>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <IconButton
          icon={muted ? MicrophoneSlash : Microphone}
          label={muted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={muted}
          onClick={() => onMutedChange(!muted)}
        />
        <Button variant="secondary" icon={PhoneDisconnect} onClick={onEnd}>
          End conversation
        </Button>
      </div>
    </section>
  );
}

export function TeachingPage({
  title,
  body,
  example,
  onNext,
}: {
  title: string;
  body: string;
  example?: string;
  onNext: () => void;
}) {
  const quote = example ? (
    <blockquote className="rounded-2xl border border-line bg-paper p-6 text-title text-ink">{example}</blockquote>
  ) : null;
  return (
    <section className="flex min-h-[calc(100dvh-8rem)] flex-col justify-between gap-10 py-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <CoachAvatar small />
          <Text size="label" tone="muted">
            A useful idea
          </Text>
        </div>
        <Heading level={1}>{title}</Heading>
        <p className="whitespace-pre-line text-body leading-relaxed text-ink">{body}</p>
        {quote}
      </div>
      <Button fullWidth onClick={onNext}>
        Check my understanding
      </Button>
    </section>
  );
}

export function LessonStage({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-h-[calc(100dvh-8rem)] flex-col gap-8 py-6 [&>form]:flex-1 [&>form]:justify-between">
      {children}
    </section>
  );
}

export function RoadmapUnit({
  number,
  title,
  description,
  detail,
  children,
}: {
  number: number;
  title: string;
  description: string;
  detail: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-paper px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 [&_h2]:truncate">
          <Heading level={2} size="body">
            {number}. {title}
          </Heading>
          <p title={description} className="truncate text-caption text-muted">
            {description}
          </p>
        </div>
        <div className="shrink-0">{detail}</div>
      </div>
      <ol className="mx-auto flex w-full max-w-xl flex-col px-2 py-4 sm:px-5">{children}</ol>
    </section>
  );
}

type NodeState = "complete" | "active" | "locked";

const skillIcons = { vocabulary: BookOpenText, grammar: TextAa, fluency: ChatCircleText };
const nodeStyles: Record<NodeState, string> = {
  active:
    "border-primary bg-primary-soft text-primary shadow-card ring-2 ring-primary ring-offset-4 ring-offset-canvas",
  complete: "border-correct bg-correct-tint text-correct",
  locked: "border-line bg-subtle text-muted",
};
const statePrefix: Record<NodeState, string> = { locked: "Locked: ", complete: "Completed: ", active: "Available: " };

function LockBadge() {
  return (
    <span
      aria-hidden
      className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border border-line bg-canvas text-muted"
    >
      <Lock size={12} weight="regular" />
    </span>
  );
}

function NodePath({ state }: { state: NodeState }) {
  const dash = state === "complete" ? undefined : "4 5";
  return (
    <svg
      aria-hidden
      viewBox="0 0 120 100"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute top-7 left-0 z-behind h-full w-30 overflow-visible fill-none group-last:hidden ${state === "complete" ? "stroke-correct" : "stroke-line-strong"}`}
    >
      <path
        d="M28 0 C28 50 92 50 92 100"
        className="hidden group-odd:block"
        strokeWidth="2"
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M92 0 C92 50 28 50 28 100"
        className="hidden group-even:block"
        strokeWidth="2"
        strokeDasharray={dash}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function RoadmapNode({
  state,
  title,
  description,
  children,
  skill = "vocabulary",
  render,
  onClick,
}: {
  state: NodeState;
  title: string;
  description?: string;
  children?: ReactNode;
  skill?: "grammar" | "vocabulary" | "fluency";
  render?: ReactElement;
  onClick?: () => void;
}) {
  const Icon = state === "complete" ? Check : skillIcons[skill];
  const interactive = state !== "locked" && Boolean(render || onClick);
  const circle = useRender({
    render: interactive ? (render ?? <BaseButton />) : <span />,
    props: {
      onClick: interactive ? onClick : undefined,
      "aria-label": interactive ? `${state === "complete" ? "Review" : "Open"} ${title}` : undefined,
      "aria-hidden": !interactive || undefined,
      // A live node's overlay stretches its click area over the whole row (the <li> is the positioned parent).
      className: `${interactive ? "after:absolute after:inset-0 after:content-['']" : "relative"} flex size-14 shrink-0 items-center justify-center rounded-full border text-title ${nodeStyles[state]}`,
      children: (
        <>
          <Icon aria-hidden size={24} weight="regular" />
          {state === "locked" && <LockBadge />}
        </>
      ),
    },
  });
  const description_ = description ? (
    <Text size="caption" tone="muted">
      {description}
    </Text>
  ) : null;
  return (
    <li className="group relative isolate flex min-h-28 min-w-0 items-start gap-4 pb-10 even:pl-16 last:min-h-0 last:pb-0">
      <NodePath state={state} />
      {circle}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 pt-2">
        <span className="sr-only">{statePrefix[state]}</span>
        <Text>{title}</Text>
        {description_}
        {children}
      </div>
    </li>
  );
}
