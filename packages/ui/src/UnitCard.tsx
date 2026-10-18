import { Meter as BaseMeter } from "@base-ui/react/meter";
import { useRender } from "@base-ui/react/use-render";
import { BookOpenText, ChatCircleText, CheckCircle, CircleDashed, MapPin, Play, SkipForward, TextAa } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement, ReactNode } from "react";
import { Card } from "./Card";
import { Heading } from "./Heading";
import { labelledBarParts } from "./ProgressBar";
import { Text } from "./Text";

const tag = cva("inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1 text-caption font-bold", {
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
const top = cva("flex items-start justify-between gap-3");
const tile = cva("grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-title text-primary");
const heading = cva("flex min-w-0 flex-1 flex-col gap-0.5");
const titleLink = cva("rounded-lg hover:text-primary");

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
export function UnitCard({ title, objective, status, level = 2, number, skill, progress, action, render }: UnitCardProps) {
  const titleElement = useRender({ render: action && render ? render : <span />, props: { className: titleLink(), children: title } });
  return (
    <Card render={action ? undefined : render}>
      <div className={body()}>
        <div className={top()}>
          <UnitIcon skill={skill} />
          <UnitStatusTag status={status} />
        </div>
        <div className={heading()}>
          {number && (
            <Text size="label" tone="muted">
              {`Unit ${number}`}
            </Text>
          )}
          <Heading level={level} size="title">
            {titleElement}
          </Heading>
        </div>
        <Text tone="muted">{objective}</Text>
        {progress && <ObjectiveMeter {...progress} />}
        {action && <div>{action}</div>}
      </div>
    </Card>
  );
}

function ObjectiveMeter({ value, lessonsDone }: { value: number; lessonsDone: number }) {
  return (
    <BaseMeter.Root value={value} className={labelledBarParts.root()}>
      <BaseMeter.Label className={labelledBarParts.label()}>{`${value}% of the way to the objective`}</BaseMeter.Label>
      <span className={labelledBarParts.value()}>{`${lessonsDone} ${lessonsDone === 1 ? "Lesson" : "Lessons"} done`}</span>
      <BaseMeter.Track className={labelledBarParts.track()}>
        <BaseMeter.Indicator className={labelledBarParts.indicator()} />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}
