import { useRender } from "@base-ui/react/use-render";
import { Fire, Lightning, Trophy, type Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement } from "react";
import { skillNames, type CefrLevel, type Skill } from "./SkillBar";

/** The rail's tinted tiles: they sit on the white rail panel, like cards in a tray. */
export const railTileClasses = "rounded-2xl border border-line bg-subtle p-4 text-ink";

const body = cva(`flex flex-col gap-4 ${railTileClasses}`);
const who = cva("flex items-center gap-3");
const avatar = cva("grid size-14 shrink-0 place-items-center rounded-full bg-primary text-heading text-on-primary ring-4 ring-primary-soft");
const name = cva("truncate text-body font-semibold");
const levelsClasses = cva("flex flex-wrap gap-1.5 rounded-lg");
const level = cva("rounded-full bg-primary-soft px-2 py-0.5 text-label font-semibold tracking-normal text-primary");
const stats = cva("grid grid-cols-3 divide-x divide-line rounded-xl bg-paper py-3");
const stat = cva("flex flex-col items-center gap-0.5 px-1 text-center");
const value = cva("inline-flex items-center gap-1 text-title tabular-nums");
const statIcon = cva("text-body", {
  variants: {
    tone: {
      streak: "text-skill-vocabulary",
      xp: "text-skill-fluency",
      mastery: "text-almost",
    },
  },
});
const label = cva("text-label font-normal tracking-normal text-muted");

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
      children: levels.map((l) => <span key={l.skill} className={level()}>{`${skillNames[l.skill]} ${l.level}`}</span>),
    },
  });
  return (
    <section aria-label="Your profile" className={body()}>
      <div className={who()}>
        <span aria-hidden className={avatar()}>
          {learner.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={name()}>{learner}</p>
          {levels.length > 0 && levelChips}
        </div>
      </div>
      <div className={stats()}>
        <Stat icon={Fire} tone="streak" value={streak} label="Day streak" />
        <Stat icon={Lightning} tone="xp" value={xp} label="XP" />
        <Stat icon={Trophy} tone="mastery" value={unitsMastered} label={unitsMastered === 1 ? "Unit mastered" : "Units mastered"} />
      </div>
    </section>
  );
}

function Stat({ icon: StatIcon, tone, value: n, label: text }: { icon: Icon; tone: "streak" | "xp" | "mastery"; value: number; label: string }) {
  return (
    <p className={stat()}>
      <span className={value()}>
        <StatIcon aria-hidden weight="fill" className={statIcon({ tone })} />
        {n}
      </span>{" "}
      <span className={label()}>{text}</span>
    </p>
  );
}
