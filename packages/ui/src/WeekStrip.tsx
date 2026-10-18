import { cva } from "class-variance-authority";
import { railTileClasses } from "./ProfileCard";

const body = cva(`flex flex-col gap-3 ${railTileClasses}`);
const top = cva("flex items-baseline justify-between gap-3");
const title = cva("text-body font-semibold");
const count = cva("text-caption text-muted tabular-nums");
const days = cva("grid grid-cols-7 gap-1.5");
const day = cva("flex flex-col items-center gap-0.5 rounded-xl py-2 tabular-nums", {
  variants: {
    state: {
      practised: "bg-primary text-on-primary",
      today: "bg-paper text-ink",
      past: "bg-paper text-ink",
      future: "text-muted",
    },
    today: { true: "ring-2 ring-primary ring-offset-2 ring-offset-subtle" },
  },
});
const weekday = cva("text-label font-normal tracking-normal opacity-80");
const date = cva("text-body font-semibold");

export type WeekStripProps = {
  /** Monday to Sunday, each day as YYYY-MM-DD. */
  week: { day: string; practised: boolean; today: boolean }[];
};

/** This week, Monday to Sunday: the days with a completed Lesson filled in, and today ringed. */
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
          <li key={d.day} className={day({ state: d.practised ? "practised" : d.today ? "today" : i > todayAt ? "future" : "past", today: d.today })}>
            <span className={weekday()}>{new Date(d.day).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>{" "}
            <span className={date()}>{Number(d.day.slice(8))}</span>
            {(d.practised || d.today) && (
              <span className="sr-only">{` ${[d.practised && "practised", d.today && "today"].filter(Boolean).join(", ")}`}</span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
