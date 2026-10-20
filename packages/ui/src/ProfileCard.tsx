import { useRender } from "@base-ui/react/use-render";
import { Fire, Lightning, Trophy, type Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement } from "react";
import { skillNames, type CefrLevel, type Skill } from "./SkillBar";

export const railTileClasses = "rounded-3xl border border-line bg-paper p-5 text-ink shadow-card";

const body = cva(`flex flex-col gap-4 ${railTileClasses}`);
const who = cva("flex items-center gap-3");
const avatar = cva(
  "grid size-14 shrink-0 place-items-center rounded-full bg-primary text-heading text-on-primary ring-4 ring-primary-soft",
);
const name = cva("truncate text-body font-semibold");
const levelsClasses = cva("flex flex-wrap gap-1.5 rounded-lg");
const level = cva("rounded-full bg-primary-soft px-2 py-0.5 text-label font-semibold tracking-normal text-primary");
const stats = cva("grid grid-cols-3 divide-x divide-line border-t border-line pt-4");
const stat = cva("flex flex-col items-center gap-0.5 px-1 text-center");
const value = cva("inline-flex items-center gap-1 text-title tabular-nums");
const label = cva("text-label font-normal tracking-normal text-muted");

export type ProfileCardProps = {
  name: string;
  levels: { skill: Skill; level: CefrLevel }[];
  levelsRender?: ReactElement;
  streak: number;
  xp: number;
  unitsMastered: number;
};

const toneClass = { streak: "text-streak", xp: "text-primary" };

export function ProfileCard({ name: learner, levels, levelsRender, streak, xp, unitsMastered }: ProfileCardProps) {
  const levelChips = useRender({
    render: levelsRender ?? <div />,
    props: {
      className: levelsClasses(),
      children: levels.map((l) => <span key={l.skill} className={level()}>{`${skillNames[l.skill]} ${l.level}`}</span>),
    },
  });
  const chips = levels.length > 0 ? levelChips : null;
  const unitsLabel = unitsMastered === 1 ? "Unit mastered" : "Units mastered";
  return (
    <section aria-label="Your profile" className={body()}>
      <div className={who()}>
        <span aria-hidden className={avatar()}>
          {learner.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={name()}>{learner}</p>
          {chips}
        </div>
      </div>
      <div className={stats()}>
        <Stat tone="streak" icon={Fire} value={streak} label="Day streak" />
        <Stat tone="xp" icon={Lightning} value={xp} label="XP" />
        <Stat icon={Trophy} value={unitsMastered} label={unitsLabel} />
      </div>
    </section>
  );
}

function Stat({
  icon: StatIcon,
  value: n,
  label: text,
  tone,
}: {
  icon: Icon;
  value: number;
  label: string;
  tone?: "streak" | "xp";
}) {
  return (
    <p className={stat()}>
      <span className={value()}>
        <StatIcon
          aria-hidden
          weight={tone ? "fill" : "regular"}
          size={18}
          className={tone ? toneClass[tone] : "text-muted"}
        />
        {n}
      </span>{" "}
      <span className={label()}>{text}</span>
    </p>
  );
}
