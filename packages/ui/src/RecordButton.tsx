import { Button as BaseButton } from "@base-ui/react/button";
import { Microphone, Stop } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { spinner } from "./Spinner";

// A pulsing live ring sits behind the button while it records.
const wrap = cva("relative inline-flex rounded-pill p-1");
const ring = cva("absolute inset-0 rounded-pill bg-live motion-safe:animate-pulse");
const button = cva(
  "relative inline-flex size-record items-center justify-center rounded-pill border-2 text-heading shadow-press focus-visible:focus-ring motion-safe:transition motion-safe:duration-press motion-safe:ease-press not-data-disabled:active:shadow-none motion-safe:not-data-disabled:active:translate-press",
  {
    variants: {
      state: {
        idle: "border-line bg-primary text-on-primary",
        recording: "border-line bg-paper text-ink",
        processing: "border-line bg-subtle text-muted shadow-none",
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
  const label = { idle: "Start recording", recording: "Stop recording", processing: "Processing your recording" }[state];
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
        {state === "processing" ? <span aria-hidden className={spinner()} /> : state === "recording" ? <Stop aria-hidden /> : <Microphone aria-hidden />}
      </BaseButton>
    </span>
  );
}
