import { useRender } from "@base-ui/react/use-render";
import { cva } from "class-variance-authority";
import type { ReactElement } from "react";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { skillNames, type CefrLevel, type Skill } from "./SkillBar";

const body = cva("flex flex-col gap-5");
const who = cva("flex items-center gap-4");
const avatar = cva("grid size-14 shrink-0 place-items-center rounded-full bg-primary text-heading text-on-primary");
const name = cva("text-title text-ink");
const levelsClasses = cva("flex flex-wrap gap-2 rounded-full");
const stats = cva("grid grid-cols-3 divide-x divide-line rounded-2xl bg-subtle py-3");
const stat = cva("flex flex-col items-center gap-0.5 px-2 text-center");
const value = cva("text-title tabular-nums");
const label = cva("text-caption text-muted");

export type ProfileCardProps = {
  name: string;
  /** The CEFR Level of each measured skill; skills not measured yet are left out. */
  levels: { skill: Skill; level: CefrLevel }[];
  /** Renders the CEFR Levels as this element, for example a router link to Progress. */
  levelsRender?: ReactElement;
  streak: number;
  xp: number;
  unitsMastered: number;
};

/** Who the Learner is and where they stand: their name, CEFR Levels, and Streak, XP and Units mastered. */
export function ProfileCard({ name: learner, levels, levelsRender, streak, xp, unitsMastered }: ProfileCardProps) {
  const levelChips = useRender({
    render: levelsRender ?? <div />,
    props: {
      className: levelsClasses(),
      children: levels.map((l) => <Chip key={l.skill} tone="soft">{`${skillNames[l.skill]} ${l.level}`}</Chip>),
    },
  });
  return (
    <Card>
      <div className={body()}>
        <div className={who()}>
          <span aria-hidden className={avatar()}>
            {learner.charAt(0).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <p className={name()}>{learner}</p>
            {levels.length > 0 && levelChips}
          </div>
        </div>
        <div className={stats()}>
          <Stat value={streak} label="Day streak" />
          <Stat value={xp} label="XP" />
          <Stat value={unitsMastered} label={unitsMastered === 1 ? "Unit mastered" : "Units mastered"} />
        </div>
      </div>
    </Card>
  );
}

function Stat({ value: n, label: text }: { value: number; label: string }) {
  return (
    <p className={stat()}>
      <span className={value()}>{n}</span> <span className={label()}>{text}</span>
    </p>
  );
}
