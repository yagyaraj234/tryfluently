import { Fire } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { Card } from "./Card";

const body = cva("flex flex-col items-start gap-2");
const number = cva("flex items-center gap-2 text-hero tabular-nums");
const flame = cva("text-primary");
const label = cva("text-label uppercase");

export type StreakCardProps = {
  /** Consecutive days with a completed Lesson. */
  days: number;
};

/** The Streak as a big number on a card, the one people screenshot. For the app chrome, use StreakChip. */
export function StreakCard({ days }: StreakCardProps) {
  return (
    <Card>
      <div className={body()}>
        <span className={number()}>
          <Fire aria-hidden className={flame()} />
          {days}
        </span>{" "}
        <span className={label()}>day streak</span>
      </div>
    </Card>
  );
}
