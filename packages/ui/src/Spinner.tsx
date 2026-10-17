import { cva } from "class-variance-authority";

const spinner = cva(
  "inline-block size-6 shrink-0 rounded-pill border-2 border-line border-t-primary motion-safe:animate-spin",
);
const hidden = cva("sr-only");

export type SpinnerProps = {
  /** What is loading, for example "Loading your Lesson". The accessible name. */
  label: string;
};

/** Shows that something is loading. Turns only when reduced motion is off. */
export function Spinner({ label }: SpinnerProps) {
  // The label is the name and also the content, because screen readers announce a status by its content.
  return (
    <span role="status" aria-label={label} className={spinner()}>
      <span className={hidden()}>{label}</span>
    </span>
  );
}
