import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

const layout = cva("grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(var(--container-rail),1fr)]");
const mainColumn = cva("flex min-w-0 flex-col gap-8");
const rail = cva("flex min-w-0 flex-col gap-4");

export type DashboardProps = {
  main: ReactNode;
  rail: ReactNode;
};

export function Dashboard({ main, rail: railSlot }: DashboardProps) {
  return (
    <div className={layout()}>
      <div className={mainColumn()}>{main}</div>
      <aside aria-label="Your progress" className={rail()}>
        {railSlot}
      </aside>
    </div>
  );
}
