import { Fire } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { Card } from "./Card";

const body = cva("flex flex-col items-start gap-2");
const number = cva("flex items-center gap-2 text-hero tabular-nums");
const flame = cva("text-streak", { variants: { milestone: { true: "motion-safe:animate-celebrate" } } });
const label = cva("text-label uppercase");

export type StreakCardProps = {
  days: number;
};

export function StreakCard({ days }: StreakCardProps) {
  return (
    <Card>
      <div className={body()}>
        <span className={number()}>
          <Fire aria-hidden weight="fill" className={flame({ milestone: days > 0 && days % 7 === 0 })} />
          {days}
        </span>{" "}
        <span className={label()}>day streak</span>
      </div>
    </Card>
  );
}
