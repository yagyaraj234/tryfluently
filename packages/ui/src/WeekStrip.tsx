import { cva } from "class-variance-authority";
import { Card } from "./Card";
import { Heading } from "./Heading";

const body = cva("flex flex-col gap-4");
const days = cva("grid grid-cols-7 gap-1 text-center");
const weekday = cva("text-caption text-muted");
const date = cva("mx-auto grid size-9 place-items-center rounded-full text-caption font-semibold tabular-nums", {
  variants: {
    state: {
      practised: "bg-primary text-on-primary",
      today: "text-ink",
      past: "bg-subtle text-ink",
      future: "text-muted",
    },
    today: { true: "ring-2 ring-primary ring-offset-2 ring-offset-paper" },
  },
});

export type WeekStripProps = {
  /** Monday to Sunday, each day as YYYY-MM-DD. */
  week: { day: string; practised: boolean; today: boolean }[];
};

/** This week, Monday to Sunday: the days with a completed Lesson filled in, and today ringed. */
export function WeekStrip({ week }: WeekStripProps) {
  const todayAt = week.findIndex((d) => d.today);
  return (
    <Card>
      <div className={body()}>
        <Heading level={2} size="title">
          This week
        </Heading>
        <ol className={days()}>
          {week.map((d, i) => {
            const state = d.practised ? "practised" : d.today ? "today" : i > todayAt ? "future" : "past";
            return (
              <li key={d.day} className="flex flex-col gap-1.5">
                <span className={weekday()}>{new Date(d.day).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>{" "}
                <span className={date({ state, today: d.today })}>{Number(d.day.slice(8))}</span>
                {(d.practised || d.today) && <span className="sr-only">{` ${[d.practised && "practised", d.today && "today"].filter(Boolean).join(", ")}`}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
