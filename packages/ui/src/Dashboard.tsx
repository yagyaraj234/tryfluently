import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

// At `lg` the rail bleeds out of AppShell's main padding (pt-6, pr-8, pb-10) to sit flush against the right edge.
const layout = cva(
  "flex flex-col gap-8 lg:-mt-6 lg:-mr-8 lg:-mb-10 lg:grid lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_var(--container-rail)] lg:gap-0",
);
const mainColumn = cva("flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-start-1 lg:pt-6 lg:pr-8 lg:pb-10");
const rail = cva(
  "flex flex-col gap-3 rounded-3xl border border-line bg-paper p-4 shadow-card lg:col-start-2 lg:row-start-1 lg:rounded-none lg:border-0 lg:border-l lg:px-5 lg:pt-6 lg:pb-10 lg:shadow-none",
);

export type DashboardProps = {
  main: ReactNode;
  /** The Learner's own numbers. A panel above the main column on phones, a full-height column on the right at `lg`. */
  rail: ReactNode;
};

/** Home's layout inside AppShell: the main column, and a rail of the Learner's numbers. */
export function Dashboard({ main, rail: railSlot }: DashboardProps) {
  return (
    <div className={layout()}>
      <aside aria-label="Your progress" className={rail()}>
        {railSlot}
      </aside>
      <div className={mainColumn()}>{main}</div>
    </div>
  );
}
