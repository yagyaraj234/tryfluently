import { Meter as BaseMeter } from "@base-ui/react/meter";
import { labelledBarParts, type ProgressBarProps } from "./ProgressBar";

export type MeterProps = ProgressBarProps;

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
