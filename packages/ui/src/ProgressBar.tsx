import { Progress } from "@base-ui/react/progress";
import { cva } from "class-variance-authority";

/** The labelled bar shared by ProgressBar and Meter: label and value above, track below. */
export const bar = {
  root: cva("grid grid-cols-2 gap-y-2 text-ink"),
  label: cva("text-caption font-bold"),
  value: cva("text-caption text-right tabular-nums"),
  track: cva("col-span-2 h-3 overflow-hidden rounded-pill border-2 border-line bg-subtle"),
  indicator: cva("block h-full bg-primary motion-safe:transition-all motion-safe:duration-ui motion-safe:ease-ui"),
};

export type ProgressBarProps = {
  value: number;
  /** @default 100 */
  max?: number;
  /** The visible label, which is also the accessible name. */
  label: string;
};

/** How far through a task the Learner is, for example a Lesson. */
export function ProgressBar({ label, ...props }: ProgressBarProps) {
  return (
    <Progress.Root className={bar.root()} {...props}>
      <Progress.Label className={bar.label()}>{label}</Progress.Label>
      <Progress.Value className={bar.value()} />
      <Progress.Track className={bar.track()}>
        <Progress.Indicator className={bar.indicator()} />
      </Progress.Track>
    </Progress.Root>
  );
}
