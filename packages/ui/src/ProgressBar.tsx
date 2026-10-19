import { Progress } from "@base-ui/react/progress";
import { cva } from "class-variance-authority";

/** The labelled bar shared by ProgressBar and Meter: label and value above, track below. */
export const labelledBarParts = {
  root: cva("grid grid-cols-2 gap-y-2 text-ink"),
  label: cva("text-caption font-bold"),
  value: cva("text-caption text-right tabular-nums"),
  track: cva("col-span-2 h-2 overflow-hidden rounded-full border border-line bg-subtle"),
  indicator: cva("block h-full bg-primary"),
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
    <Progress.Root className={labelledBarParts.root()} {...props}>
      <Progress.Label className={labelledBarParts.label()}>{label}</Progress.Label>
      <Progress.Value className={labelledBarParts.value()} />
      <Progress.Track className={labelledBarParts.track()}>
        <Progress.Indicator className={labelledBarParts.indicator()} />
      </Progress.Track>
    </Progress.Root>
  );
}
