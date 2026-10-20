import { Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

const bar = cva("sticky top-0 z-sticky flex flex-wrap items-center gap-3 rounded-xl border bg-paper px-4 py-3", {
  variants: { live: { true: "border-live", false: "border-line" } },
});
const dot = cva("size-3 shrink-0 rounded-full", {
  variants: { live: { true: "bg-live motion-safe:animate-pulse", false: "border border-line bg-subtle" } },
});
const label = cva("text-label font-bold uppercase", {
  variants: { live: { true: "text-live-text", false: "text-muted" } },
});
const about = cva("flex flex-1 flex-wrap items-center gap-3");
const title = cva("text-body font-bold text-ink");
const time = cva("text-caption font-bold tabular-nums", {
  variants: { live: { true: "text-live-text", false: "text-muted" } },
});
const actions = cva("flex items-center gap-3");

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const states = { connecting: "Connecting…", live: "Live", reconnecting: "Reconnecting…" };

export type LiveBarProps = {
  state: keyof typeof states;
  title: string;
  elapsed?: number;
  left?: number;
  leftLabel?: string;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  onEnd: () => void;
  endLabel?: string;
};

export function LiveBar({
  state,
  title: name,
  elapsed,
  left,
  leftLabel = "left",
  muted,
  onMutedChange,
  onEnd,
  endLabel = "End",
}: LiveBarProps) {
  const live = state === "live";
  const elapsedTime =
    elapsed !== undefined ? (
      <span className={time({ live })}>{minutes(Math.max(0, Math.floor(elapsed / 1000)))}</span>
    ) : null;
  const leftTime =
    left !== undefined ? (
      <span className={time({ live })}>
        {minutes(Math.max(0, Math.ceil(left / 1000)))} {leftLabel}
      </span>
    ) : null;
  return (
    <div className={bar({ live })}>
      <div className={about()}>
        <span aria-hidden className={dot({ live })} />
        <span role="status" className={label({ live })}>
          {states[state]}
        </span>
        <span className={title()}>{name}</span>
        {elapsedTime}
        {leftTime}
      </div>
      <div className={actions()}>
        <IconButton
          icon={muted ? MicrophoneSlash : Microphone}
          label="Mute"
          aria-pressed={muted}
          onClick={() => onMutedChange(!muted)}
        />
        <Button variant="secondary" onClick={onEnd}>
          {endLabel}
        </Button>
      </div>
    </div>
  );
}
