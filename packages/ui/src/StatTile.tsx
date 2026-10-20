import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { railTileClasses } from "./ProfileCard";

const body = cva(`flex flex-col items-start gap-3 ${railTileClasses}`);
const tile = cva("grid size-10 place-items-center rounded-xl bg-subtle text-title text-muted");
const value = cva("text-heading tabular-nums");
const label = cva("text-caption text-muted");

export type StatTileProps = {
  icon: Icon;
  value: number;
  label: string;
};

export function StatTile({ icon: Icon, value: n, label: text }: StatTileProps) {
  return (
    <div className={body()}>
      <span className={tile()}>
        <Icon aria-hidden />
      </span>
      <p className="flex flex-col">
        <span className={value()}>{n}</span> <span className={label()}>{text}</span>
      </p>
    </div>
  );
}
