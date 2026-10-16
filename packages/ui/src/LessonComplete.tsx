import { Confetti } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { Heading } from "./Heading";
import { StreakCard } from "./StreakCard";

// A loud panel inside the quiet practice screen: the celebration is a brand moment.
const panel = cva("surface-loud flex flex-col items-center gap-6 rounded-md border-2 border-line bg-surface p-8 text-center text-ink");
const icon = cva("text-hero text-primary");
const xp = cva("text-hero tabular-nums");
const actions = cva("flex flex-wrap justify-center gap-3");

export type LessonCompleteProps = {
  /** XP earned in this Lesson. Left out when it isn't known. */
  xpGained?: number;
  /** The Streak in days, after this Lesson. */
  streak: number;
  /** What to do next, for example Buttons for the next Lesson and Home. */
  actions?: ReactNode;
};

/** The end of a Lesson: the celebration, the XP gained, the Streak and the next actions. */
export function LessonComplete({ xpGained, streak, actions: next }: LessonCompleteProps) {
  return (
    <section className={panel()}>
      <span className={icon()}>
        <Confetti aria-hidden />
      </span>
      <Heading level={1}>Lesson complete</Heading>
      {xpGained !== undefined && <p className={xp()}>{`+${xpGained} XP`}</p>}
      <StreakCard days={streak} />
      {next && <div className={actions()}>{next}</div>}
    </section>
  );
}
