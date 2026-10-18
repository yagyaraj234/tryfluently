import type { Icon } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { railTileClasses } from "./ProfileCard";

const body = cva(`flex flex-col items-start gap-3 ${railTileClasses}`);
const tile = cva("grid size-10 place-items-center rounded-xl bg-paper text-title text-primary");
const value = cva("text-title tabular-nums");
const label = cva("text-caption text-muted");

export type StatTileProps = {
  icon: Icon;
  value: number;
  /** Follows the number, so it reads as one phrase: "2 Lessons done". */
  label: string;
};

/** One number worth a glance, as a tile on Home's rail. */
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
