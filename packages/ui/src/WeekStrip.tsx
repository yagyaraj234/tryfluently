import { cva } from "class-variance-authority";
import { railTileClasses } from "./ProfileCard";

const body = cva(`flex flex-col gap-3 ${railTileClasses}`);
const top = cva("flex items-baseline justify-between gap-3");
const title = cva("text-body font-semibold");
const count = cva("text-caption text-muted tabular-nums");
const days = cva("grid grid-cols-7 gap-1.5");
const day = cva("flex flex-col items-center gap-0.5 rounded-xl py-2 whitespace-nowrap tabular-nums", {
  variants: {
    state: {
      practised: "bg-streak text-paper dark:bg-streak-soft dark:text-streak",
      today: "bg-paper text-ink",
      past: "bg-paper text-ink",
      future: "text-muted",
    },
    today: { true: "ring-2 ring-streak ring-offset-2 ring-offset-paper" },
  },
});
const weekday = cva("text-label font-normal tracking-normal opacity-80");
const date = cva("text-body font-semibold");

export type WeekStripProps = {
  week: { day: string; practised: boolean; today: boolean }[];
};

type WeekDay = WeekStripProps["week"][number];

function dayState(d: WeekDay, i: number, todayAt: number) {
  if (d.practised) return "practised";
  if (d.today) return "today";
  return i > todayAt ? "future" : "past";
}

function DayCell({ d, state }: { d: WeekDay; state: "practised" | "today" | "future" | "past" }) {
  const weekdayName = new Date(d.day).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const marks = [d.practised && "practised", d.today && "today"].filter(Boolean).join(", ");
  const srMarks = marks && <span className="sr-only">{` ${marks}`}</span>;
  return (
    <li className={day({ state, today: d.today })}>
      <span className={weekday()}>{weekdayName}</span> <span className={date()}>{Number(d.day.slice(8))}</span>
      {srMarks}
    </li>
  );
}

export function WeekStrip({ week }: WeekStripProps) {
  const todayAt = week.findIndex((d) => d.today);
  const practised = week.filter((d) => d.practised).length;
  return (
    <section aria-label="This week" className={body()}>
      <div className={top()}>
        <h2 className={title()}>This week</h2>
        <span className={count()}>{`${practised}/7 days`}</span>
      </div>
      <ol className={days()}>
        {week.map((d, i) => (
          <DayCell key={d.day} d={d} state={dayState(d, i, todayAt)} />
        ))}
      </ol>
    </section>
  );
}
