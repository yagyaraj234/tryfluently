import { Microphone, MicrophoneSlash } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { Button } from "./Button";
import { IconButton } from "./IconButton";

// Pink only once the call is live: the colour means a live microphone.
const bar = cva("sticky top-0 z-sticky flex flex-wrap items-center gap-3 rounded-md border-2 bg-paper px-4 py-3", {
  variants: { live: { true: "border-live", false: "border-line" } },
});
const dot = cva("size-3 shrink-0 rounded-pill", {
  variants: { live: { true: "bg-live motion-safe:animate-pulse", false: "border-2 border-line bg-subtle" } },
});
const label = cva("text-label font-bold uppercase", { variants: { live: { true: "text-live", false: "text-muted" } } });
const about = cva("flex flex-1 flex-wrap items-center gap-3");
const title = cva("text-body font-bold text-ink");
const time = cva("text-caption font-bold tabular-nums", { variants: { live: { true: "text-live", false: "text-muted" } } });
const actions = cva("flex items-center gap-3");

const minutes = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const states = { connecting: "Connecting…", live: "Live", reconnecting: "Reconnecting…" };

export type LiveBarProps = {
  state: keyof typeof states;
  /** What the call is, for example "Voice Assessment" or "Mock Interview · Friendly". */
  title: string;
  /** Milliseconds since the call started. */
  elapsed?: number;
  /** Milliseconds left, for example of the 10-minute Assessment or of today's voice minutes. */
  left?: number;
  /** Follows the time left: "left" (the default) or, say, "left today". */
  leftLabel?: string;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
  onEnd: () => void;
  endLabel?: string;
};

/** The top of a live voice call: whether it's live, the time so far and left, mute and End. */
export function LiveBar({ state, title: name, elapsed, left, leftLabel = "left", muted, onMutedChange, onEnd, endLabel = "End" }: LiveBarProps) {
  const live = state === "live";
  return (
    <div className={bar({ live })}>
      <div className={about()}>
        <span aria-hidden className={dot({ live })} />
        <span role="status" className={label({ live })}>
          {states[state]}
        </span>
        <span className={title()}>{name}</span>
        {elapsed !== undefined && <span className={time({ live })}>{minutes(Math.max(0, Math.floor(elapsed / 1000)))}</span>}
        {left !== undefined && (
          <span className={time({ live })}>
            {minutes(Math.max(0, Math.ceil(left / 1000)))} {leftLabel}
          </span>
        )}
      </div>
      <div className={actions()}>
        <IconButton icon={muted ? MicrophoneSlash : Microphone} label="Mute" aria-pressed={muted} onClick={() => onMutedChange(!muted)} />
        <Button variant="secondary" onClick={onEnd}>
          {endLabel}
        </Button>
      </div>
    </div>
  );
}
