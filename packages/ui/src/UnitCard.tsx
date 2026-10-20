import { Meter as BaseMeter } from "@base-ui/react/meter";
import { useRender } from "@base-ui/react/use-render";
import {
  BookOpenText,
  ChatCircleText,
  CheckCircle,
  CircleDashed,
  type Icon as PhosphorIcon,
  MapPin,
  Play,
  SkipForward,
  Target,
  TextAa,
} from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement, ReactNode } from "react";
import { Card } from "./Card";
import { skillNames } from "./SkillBar";
import { Text } from "./Text";

const tag = cva(
  "inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2.5 py-0.5 text-label font-semibold tracking-normal",
  {
    variants: {
      status: {
        planned: "bg-paper text-ink",
        active: "bg-primary-soft text-primary",
        mastered: "bg-correct-tint text-correct",
        skipped: "bg-subtle text-muted",
      },
    },
  },
);

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

export function UnitStatusTag({ status }: UnitStatusTagProps) {
  const { word, icon: Icon } = statuses[status];
  return (
    <span className={tag({ status })}>
      <Icon aria-hidden size={16} />
      {word}
    </span>
  );
}

const body = cva("flex flex-col gap-4");
const top = cva("flex items-start gap-3");
const tile = cva("grid size-11 shrink-0 place-items-center rounded-xl bg-subtle text-title text-muted");
const heading = cva("flex min-w-0 flex-1 flex-col gap-2");
const titleText = cva("text-body font-semibold text-balance text-ink");
const titleLink = cva("rounded-lg hover:text-primary");
const objectiveText = cva("line-clamp-2 text-caption text-muted");
const cover = cva(
  "relative -mx-5 -mt-5 grid h-20 place-items-center border-b border-line bg-subtle text-heading text-primary",
);
const coverBadge = cva("absolute top-3 left-3 rounded-full bg-paper px-2.5 py-1 text-label tracking-normal text-muted");
const meta = cva("flex items-center justify-between gap-3 text-caption text-muted");
const metaItem = cva("inline-flex items-center gap-1.5");
const track = cva("h-2 overflow-hidden rounded-full bg-subtle");
const indicator = cva(
  "block h-full rounded-full bg-primary motion-safe:transition-all motion-safe:duration-ui motion-safe:ease-ui",
);

const skillIcons = { fluency: ChatCircleText, grammar: TextAa, vocabulary: BookOpenText };

export type UnitCardProps = {
  title: string;
  objective: string;
  status: UnitStatus;
  level?: 2 | 3;
  number?: number;
  skill?: keyof typeof skillIcons;
  progress?: { value: number; lessonsDone: number };
  cover?: boolean;
  action?: ReactNode;
  render?: ReactElement;
};

export type UnitIconProps = {
  skill?: keyof typeof skillIcons;
};

export function UnitIcon({ skill }: UnitIconProps) {
  const Icon = skill ? skillIcons[skill] : MapPin;
  return (
    <span className={tile()}>
      <Icon aria-hidden />
    </span>
  );
}

function UnitCover({ number, Icon }: { number?: number; Icon: PhosphorIcon }) {
  return (
    <div className={cover()}>
      {number && <span className={coverBadge()}>{`Unit ${number}`}</span>}
      <Icon aria-hidden size={28} />
    </div>
  );
}

export function UnitCard({
  title,
  objective,
  status,
  level = 2,
  number,
  skill,
  progress,
  cover: hasCover,
  action,
  render,
}: UnitCardProps) {
  const H = `h${level}` as const;
  const Icon = skill ? skillIcons[skill] : MapPin;
  const titleElement = useRender({
    render: action && render ? render : <span />,
    props: { className: titleLink(), children: title },
  });
  const label = [!hasCover && number && `Unit ${number}`, skill && skillNames[skill]].filter(Boolean).join(" · ");
  const coverBlock = hasCover ? <UnitCover number={number} Icon={Icon} /> : null;
  const tileBlock = hasCover ? null : <UnitIcon skill={skill} />;
  const labelBlock = label ? (
    <Text size="label" tone="muted">
      {label}
    </Text>
  ) : null;
  return (
    <Card size="sm" render={action ? undefined : render}>
      <div className={body()}>
        {coverBlock}
        <div className={top()}>
          {tileBlock}
          <div className={heading()}>
            <H className={titleText()}>{titleElement}</H>
            <div className="flex flex-wrap items-center gap-2">
              {labelBlock}
              <UnitStatusTag status={status} />
            </div>
          </div>
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
          <BookOpenText aria-hidden size={16} />
          {`${lessonsDone} ${lessonsDone === 1 ? "Lesson" : "Lessons"} done`}
        </span>
        <BaseMeter.Label className={metaItem()}>
          <Target aria-hidden size={16} />
          {`${value}% completed`}
        </BaseMeter.Label>
      </div>
    </BaseMeter.Root>
  );
}
