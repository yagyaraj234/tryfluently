import { Meter as BaseMeter } from "@base-ui/react/meter";
import { bar } from "./ProgressBar";

export type MeterProps = {
  value: number;
  /** @default 100 */
  max?: number;
  /** The visible label, which is also the accessible name. */
  label: string;
};

/** A measurement within a known range, for example a skill score. For progress through a task, use ProgressBar. */
export function Meter({ label, ...props }: MeterProps) {
  return (
    <BaseMeter.Root className={bar.root()} {...props}>
      <BaseMeter.Label className={bar.label()}>{label}</BaseMeter.Label>
      <BaseMeter.Value className={bar.value()} />
      <BaseMeter.Track className={bar.track()}>
        <BaseMeter.Indicator className={bar.indicator()} />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}
