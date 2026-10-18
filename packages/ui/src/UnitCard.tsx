import { CheckCircle, CircleDashed, Play, SkipForward } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import type { ReactElement } from "react";
import { Card } from "./Card";
import { Heading } from "./Heading";
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

const body = cva("flex flex-col gap-2");
const top = cva("flex items-start justify-between gap-4");

export type UnitCardProps = {
  title: string;
  objective: string;
  status: UnitStatus;
  /** Renders the card as this element, for example a router link to the Unit, so the whole card is one tap target. */
  render?: ReactElement;
};

/** One Unit on the Roadmap: its title, objective and status. */
export function UnitCard({ title, objective, status, render }: UnitCardProps) {
  return (
    <Card render={render}>
      <div className={body()}>
        <div className={top()}>
          <Heading level={2} size="title">
            {title}
          </Heading>
          <UnitStatusTag status={status} />
        </div>
        <Text tone="muted">{objective}</Text>
      </div>
    </Card>
  );
}
