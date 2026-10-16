import { Meter as BaseMeter } from "@base-ui/react/meter";
import { labelledBarParts, type ProgressBarProps } from "./ProgressBar";

export type MeterProps = ProgressBarProps;

/** A measurement within a known range, for example a skill score. For progress through a task, use ProgressBar. */
export function Meter({ label, ...props }: MeterProps) {
  return (
    <BaseMeter.Root className={labelledBarParts.root()} {...props}>
      <BaseMeter.Label className={labelledBarParts.label()}>{label}</BaseMeter.Label>
      <BaseMeter.Value className={labelledBarParts.value()} />
      <BaseMeter.Track className={labelledBarParts.track()}>
        <BaseMeter.Indicator className={labelledBarParts.indicator()} />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}
