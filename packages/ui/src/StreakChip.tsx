import { Fire } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { Chip } from "./Chip";

export const chipNumber = cva("text-ink tabular-nums");
const hidden = cva("sr-only");

export type StreakChipProps = {
  days: number;
};

export function StreakChip({ days }: StreakChipProps) {
  return (
    <Chip>
      <Fire aria-hidden weight="fill" size={16} className="text-streak" />
      <span className={chipNumber()}>{days}</span>
      <span className={hidden()}> day streak</span>
    </Chip>
  );
}
