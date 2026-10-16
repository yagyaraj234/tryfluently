import { cva } from "class-variance-authority";

const spinner = cva(
  "inline-block size-6 shrink-0 rounded-pill border-2 border-line border-t-primary motion-safe:animate-spin",
);

export type SpinnerProps = {
  /** What is loading, for example "Loading your Lesson". The accessible name. */
  label: string;
};

export function Spinner({ label }: SpinnerProps) {
  return <span role="status" aria-label={label} className={spinner()} />;
}
