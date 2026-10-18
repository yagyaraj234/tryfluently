import { Meter as BaseMeter } from "@base-ui/react/meter";
import { useRender } from "@base-ui/react/use-render";
import { BookOpenText, ChatCircleText, CheckCircle, CircleDashed, MapPin, Play, SkipForward, Target, TextAa } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement, ReactNode } from "react";
import { Card } from "./Card";
import { skillNames } from "./SkillBar";
import { Text } from "./Text";

const tag = cva("inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-label font-semibold tracking-normal", {
  variants: {
    status: {
      planned: "bg-paper text-ink",
      active: "bg-primary text-on-primary",
      mastered: "bg-correct-tint text-correct",
      skipped: "bg-subtle text-muted",
    },
  },
});

const statuses = {
  planned: { word: "Planned", icon: CircleDashed },
  active: { word: "Active", icon: Play },
  mastered: { word: "Mastered", icon: CheckCircle },
  skipped: { word: "Skipped", icon: SkipForward },
};

export type UnitStatus = keyof typeof statuses;

export type UnitStatusTagProps = {
  status: UnitStatus;
};

/** A Unit's status as an icon and a word, each status with its own look, so it never relies on colour alone. */
export function UnitStatusTag({ status }: UnitStatusTagProps) {
  const { word, icon: Icon } = statuses[status];
  return (
    <span className={tag({ status })}>
      <Icon aria-hidden />
      {word}
    </span>
  );
}

const body = cva("flex flex-col gap-4");
const top = cva("flex items-start gap-3");
const tile = cva("grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-title text-primary");
const heading = cva("flex min-w-0 flex-1 flex-col gap-0.5");
const titleText = cva("text-body font-semibold text-balance text-ink");
const titleLink = cva("rounded-lg hover:text-primary");
const objectiveText = cva("line-clamp-2 text-caption text-muted");
// The cover stands in for a course thumbnail: a cobalt brand panel with the Unit's icon.
const cover = cva(
  "relative isolate -mx-4 -mt-4 grid h-32 place-items-center overflow-hidden rounded-t-2xl bg-linear-160 from-brand-mid to-brand-deep text-hero text-on-brand",
);
const coverGlow = cva("absolute -top-1/2 -right-1/4 z-behind size-3/4 rounded-full bg-brand-hi/60 blur-3xl");
const coverBadge = cva("absolute top-3 left-3 rounded-full bg-on-brand/16 px-2.5 py-0.5 text-label text-on-brand uppercase");
const meta = cva("flex items-center justify-between gap-3 text-caption text-muted");
const metaItem = cva("inline-flex items-center gap-1.5");
const track = cva("h-2 overflow-hidden rounded-full bg-subtle");
const indicator = cva("block h-full rounded-full bg-primary motion-safe:transition-all motion-safe:duration-ui motion-safe:ease-ui");

const skillIcons = { fluency: ChatCircleText, grammar: TextAa, vocabulary: BookOpenText };

export type UnitCardProps = {
  title: string;
  objective: string;
  status: UnitStatus;
  /** @default 2 */
  level?: 2 | 3;
  /** The Unit's place on the Roadmap, from 1. */
  number?: number;
  /** The Unit's first skill, which picks its icon. */
  skill?: keyof typeof skillIcons;
  /** How close the latest finished Lesson came to the objective (0–100), and how many Lessons are done. */
  progress?: { value: number; lessonsDone: number };
  /** A cobalt cover with the Unit's icon on top of the card, for Units the Learner hasn't started. */
  cover?: boolean;
  /** A button for the Unit, for example Resume. With an action, `render` goes on the title instead of the whole card. */
  action?: ReactNode;
  /** Renders the card as this element, for example a router link to the Unit, so the whole card is one tap target. */
  render?: ReactElement;
};

export type UnitIconProps = {
  /** The Unit's first skill, which picks the icon. */
  skill?: keyof typeof skillIcons;
};

/** A Unit's icon on a soft tile. */
export function UnitIcon({ skill }: UnitIconProps) {
  const Icon = skill ? skillIcons[skill] : MapPin;
  return (
    <span className={tile()}>
      <Icon aria-hidden />
    </span>
  );
}

/** One Unit on the Roadmap: its icon, title, objective and status, and optionally its progress and an action. */
export function UnitCard({ title, objective, status, level = 2, number, skill, progress, cover: hasCover, action, render }: UnitCardProps) {
  const H = `h${level}` as const;
  const Icon = skill ? skillIcons[skill] : MapPin;
  const titleElement = useRender({ render: action && render ? render : <span />, props: { className: titleLink(), children: title } });
  // A cover already shows the number.
  const label = [!hasCover && number && `Unit ${number}`, skill && skillNames[skill]].filter(Boolean).join(" · ");
  return (
    <Card size="sm" render={action ? undefined : render}>
      <div className={body()}>
        {hasCover && (
          <div className={cover()}>
            <span aria-hidden className={coverGlow()} />
            {number && <span className={coverBadge()}>{`Unit ${number}`}</span>}
            <Icon aria-hidden />
          </div>
        )}
        <div className={top()}>
          {!hasCover && <UnitIcon skill={skill} />}
          <div className={heading()}>
            <H className={titleText()}>{titleElement}</H>
            {label && (
              <Text size="label" tone="muted">
                {label}
              </Text>
            )}
          </div>
          <UnitStatusTag status={status} />
        </div>
        <p className={objectiveText()}>{objective}</p>
        {progress && <ObjectiveMeter {...progress} />}
        {action && <div>{action}</div>}
      </div>
    </Card>
  );
}

function ObjectiveMeter({ value, lessonsDone }: { value: number; lessonsDone: number }) {
  return (
    <BaseMeter.Root value={value} className="flex flex-col gap-2">
      <BaseMeter.Track className={track()}>
        <BaseMeter.Indicator className={indicator()} />
      </BaseMeter.Track>
      <div className={meta()}>
        <span className={metaItem()}>
          <BookOpenText aria-hidden />
          {`${lessonsDone} ${lessonsDone === 1 ? "Lesson" : "Lessons"} done`}
        </span>
        <BaseMeter.Label className={metaItem()}>
          <Target aria-hidden />
          {`${value}% to the objective`}
        </BaseMeter.Label>
      </div>
    </BaseMeter.Root>
  );
}
