import { Fire } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { Chip } from "./Chip";

export const chipNumber = cva("text-primary tabular-nums");
const hidden = cva("sr-only");

export type StreakChipProps = {
  /** Consecutive days with a completed Lesson. */
  days: number;
};

/** The Streak in the app chrome: a flame and the number of days. */
export function StreakChip({ days }: StreakChipProps) {
  return (
    <Chip>
      <Fire aria-hidden weight="fill" className="text-skill-vocabulary" />
      <span className={chipNumber()}>{days}</span>
      <span className={hidden()}> day streak</span>
    </Chip>
  );
}
