import { BookOpen, Check, Lock, Microphone, MicrophoneSlash, PencilSimple, PhoneDisconnect } from "@phosphor-icons/react";
import { Button as BaseButton } from "@base-ui/react/button";
import { useRender } from "@base-ui/react/use-render";
import type { ReactElement, ReactNode } from "react";
import { Button } from "./Button";
import { Heading } from "./Heading";
import { IconButton } from "./IconButton";
import { ProgressBar } from "./ProgressBar";
import { Text } from "./Text";

export type CoachState = "ready" | "listening" | "thinking" | "speaking";

/** An original vector illustration; expression follows actual conversation events. */
export function CoachAvatar({ state = "ready", small = false }: { state?: CoachState; small?: boolean }) {
  return (
    <div data-state={state} className={`${small ? "size-12" : "size-48 sm:size-60"} group relative shrink-0 rounded-full border border-line bg-primary-soft p-2 ${state === "speaking" ? "motion-safe:animate-bob ring-2 ring-primary ring-offset-8 ring-offset-canvas" : ""}`}>
      <svg viewBox="0 0 200 200" fill="none" aria-hidden className="size-full">
        <circle cx="100" cy="100" r="94" className="fill-primary-soft" />
        <path d="M25 187c5-40 31-58 75-58s70 18 75 58" className="fill-primary stroke-ink" strokeWidth="2" />
        <path d="M82 122v25q18 20 36 0v-25" className="fill-paper stroke-ink" strokeWidth="2" />
        <path d="M54 82c0-36 19-58 47-58 33 0 49 22 48 60l-6 26c-5 22-24 36-43 36s-40-16-44-39Z" className="fill-paper stroke-ink" strokeWidth="2" />
        <path d="M54 92C37 62 51 25 79 23c18-18 51-4 63 13 11 15 12 38 7 56l-12-31c-27 7-49-1-58-12-4 23-12 33-25 43Z" className="fill-ink" />
        <path d="M71 84q8-5 16 0m27 0q8-5 16 0" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="80" cy="96" rx="3" ry="4" className="fill-ink" />
        <ellipse cx="121" cy="96" rx="3" ry="4" className="fill-ink" />
        <path d="m100 97-3 13h6" className="stroke-line-strong" strokeWidth="2" strokeLinecap="round" />
        {state === "speaking" ? <ellipse cx="101" cy="122" rx="9" ry="6" className="fill-ink motion-safe:animate-pulse" /> : <path d="M89 119q12 11 24 0" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />}
        <path d="M48 86v23m105-23v23M48 85c-3-55 107-55 105 0m0 24q0 19-27 19" className="stroke-muted" strokeWidth="6" strokeLinecap="round" />
        <circle cx="124" cy="128" r="5" className="fill-muted" />
      </svg>
    </div>
  );
}

export function StarterShell({ step, title, description, children }: { step: number; title: string; description: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-8 py-2 sm:py-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3"><CoachAvatar small /><Text size="caption">Your path starts here</Text></div>
        <Text size="caption" tone="muted">{step} / 3</Text>
      </div>
      <ProgressBar label={`Getting to know you: ${step} of 3`} value={step} max={3} />
      <div className="flex flex-col gap-3">
        <Heading level={1}>{title}</Heading><Text tone="muted">{description}</Text>
      </div>
      {children}
    </div>
  );
}

export function CoachCall({ state, connection, muted, onMutedChange, onEnd, caption, speaker, children }: {
  state: CoachState; connection: "connecting" | "live" | "reconnecting"; muted: boolean;
  onMutedChange: (value: boolean) => void; onEnd: () => void;
  caption?: string; speaker?: "coach" | "learner"; children?: ReactNode;
}) {
  const label = connection !== "live" ? (connection === "reconnecting" ? "Reconnecting…" : "Connecting to your coach…")
    : muted ? "Your microphone is muted" : ({ ready: "Your coach is here", listening: "Listening to you", thinking: "Your coach is thinking", speaking: "Your coach is speaking" })[state];
  return (
    <section aria-label="Voice Assessment with your AI coach" className="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-between gap-8 py-6 text-center">
      <div className="flex flex-col gap-2"><Text size="label" tone="muted">Impromptu · AI coach</Text><Heading level={1} size="title">A little conversation. A clearer path.</Heading>{children}</div>
      <div className="flex flex-col items-center gap-8"><CoachAvatar state={state} /><p role="status" className="text-body font-medium text-ink">{label}</p></div>
      <div aria-live="polite" aria-atomic="true" className="min-h-24 w-full max-w-prose rounded-2xl border border-line bg-paper p-5 text-left">
        <Text size="caption" tone="muted">{caption ? speaker === "learner" ? "You" : "Your coach" : "Live captions"}</Text>
        <Text>{caption || "Your coach will start. Speak naturally, and interrupt whenever you like."}</Text>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <IconButton icon={muted ? MicrophoneSlash : Microphone} label={muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={muted} onClick={() => onMutedChange(!muted)} />
        <Button variant="secondary" icon={PhoneDisconnect} onClick={onEnd}>End conversation</Button>
      </div>
    </section>
  );
}

export function TeachingPage({ title, body, example, onNext }: { title: string; body: string; example?: string; onNext: () => void }) {
  return (
    <section className="flex min-h-[calc(100dvh-8rem)] flex-col justify-between gap-10 py-6">
      <div className="flex flex-col gap-6"><div className="flex items-center gap-3"><CoachAvatar small /><Text size="label" tone="muted">A useful idea</Text></div>
        <Heading level={1}>{title}</Heading><p className="whitespace-pre-line text-body leading-relaxed text-ink">{body}</p>
        {example && <blockquote className="rounded-2xl border border-line bg-paper p-6 text-title text-ink">{example}</blockquote>}
      </div>
      <Button fullWidth onClick={onNext}>Check my understanding</Button>
    </section>
  );
}

export function LessonStage({ children }: { children: ReactNode }) {
  return <section className="flex min-h-[calc(100dvh-8rem)] flex-col gap-8 py-6 [&>form]:flex-1 [&>form]:justify-between">{children}</section>;
}

export function RoadmapUnit({ number, title, description, detail, children }: { number: number; title: string; description: string; detail: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-paper px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1 [&_h2]:truncate"><Heading level={2} size="body">{number}. {title}</Heading><p title={description} className="truncate text-caption text-muted">{description}</p></div><div className="shrink-0">{detail}</div>
      </div>
      <ol className="mx-auto flex w-full max-w-sm flex-col gap-6 px-5 py-4 [&>li:nth-child(4n+2)]:translate-x-4 [&>li:nth-child(4n+3)]:translate-x-8">{children}</ol>
    </section>
  );
}

export function RoadmapNode({ state, title, description, children, skill = "vocabulary", render, onClick }: {
  state: "complete" | "active" | "locked"; title: string; description?: string; children?: ReactNode;
  skill?: "grammar" | "vocabulary" | "fluency"; render?: ReactElement; onClick?: () => void;
}) {
  const Icon = state === "complete" ? Check : state === "locked" ? Lock : ({ vocabulary: BookOpen, grammar: PencilSimple, fluency: Microphone })[skill];
  const interactive = state !== "locked" && Boolean(render || onClick);
  const circle = useRender({
    render: interactive ? render ?? <BaseButton /> : <span />,
    props: {
      onClick: interactive ? onClick : undefined,
      "aria-label": interactive ? `${state === "complete" ? "Review" : "Open"} ${title}` : undefined,
      "aria-hidden": !interactive || undefined,
      className: `flex size-14 shrink-0 items-center justify-center rounded-full border text-title shadow-card ${state === "active" ? "border-primary bg-primary-soft text-ink ring-2 ring-primary ring-offset-4 ring-offset-canvas" : state === "complete" ? "border-correct bg-correct-tint text-correct" : "border-line-strong bg-subtle text-muted"}`,
      children: <Icon aria-hidden />,
    },
  });
  return (
    <li className="flex min-w-0 items-start gap-4 pr-8">
      {circle}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1 pt-2"><span className="sr-only">{state === "locked" ? "Locked: " : state === "complete" ? "Completed: " : "Available: "}</span><Text>{title}</Text>{description && <Text size="caption" tone="muted">{description}</Text>}{children}</div>
    </li>
  );
}
