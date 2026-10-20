import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { Heading } from "./Heading";
import { Mascot } from "./Mascot";
import { StreakCard } from "./StreakCard";

const panel = cva(
  "flex flex-col items-center gap-6 rounded-3xl border border-line bg-paper p-8 text-center text-ink shadow-card *:motion-safe:animate-rise *:nth-2:[animation-delay:60ms] *:nth-3:[animation-delay:120ms] *:nth-4:[animation-delay:180ms] *:nth-5:[animation-delay:240ms]",
);
const xp = cva("text-hero tabular-nums");
const actions = cva("flex flex-wrap justify-center gap-3");

export type LessonCompleteProps = {
  xpGained?: number;
  headingLevel?: 1 | 2;
  streak: number;
  actions?: ReactNode;
};

export function LessonComplete({ xpGained, streak, headingLevel = 1, actions: next }: LessonCompleteProps) {
  const xpLine = xpGained !== undefined ? <p className={xp()}>{`+${xpGained} XP`}</p> : null;
  return (
    <section className={panel()}>
      <Mascot name="pip" size="lg" />
      <Heading level={headingLevel}>Lesson complete</Heading>
      {xpLine}
      <StreakCard days={streak} />
      {next && <div className={actions()}>{next}</div>}
    </section>
  );
}
