import { Button as BaseButton } from "@base-ui/react/button";
import { Microphone, Stop } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { spinner } from "./Spinner";

// A pulsing live ring sits behind the button while it records.
const wrap = cva("relative inline-flex rounded-full p-1");
const ring = cva("absolute inset-0 rounded-full bg-live motion-safe:animate-pulse");
const button = cva(
  "relative inline-flex size-18 items-center justify-center rounded-full text-heading shadow-card motion-safe:transition motion-safe:duration-press motion-safe:ease-press motion-safe:not-data-disabled:active:scale-97",
  {
    variants: {
      state: {
        idle: "bg-primary text-on-primary shadow-glow shadow-primary/55",
        recording: "border border-line bg-paper text-ink",
        processing: "bg-subtle text-muted shadow-none",
      },
    },
  },
);

export type RecordButtonProps = {
  state: "idle" | "recording" | "processing";
  onStart: () => void;
  onStop: () => void;
};

/** The large round button that starts and stops a recorded answer. It can't be pressed while the recording is processed. */
export function RecordButton({ state, onStart, onStop }: RecordButtonProps) {
  const label = { idle: "Start recording", recording: "Stop recording", processing: "Processing your recording" }[
    state
  ];
  return (
    <span className={wrap()}>
      {state === "recording" && <span aria-hidden className={ring()} />}
      <BaseButton
        aria-label={label}
        className={button({ state })}
        disabled={state === "processing"}
        focusableWhenDisabled
        onClick={state === "recording" ? onStop : onStart}
      >
        {state === "processing" ? (
          <span aria-hidden className={spinner()} />
        ) : state === "recording" ? (
          <Stop aria-hidden />
        ) : (
          <Microphone aria-hidden />
        )}
      </BaseButton>
    </span>
  );
}
