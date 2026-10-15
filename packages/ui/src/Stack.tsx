import { cva } from "class-variance-authority";
import type { ReactNode } from "react";

// Spelled out in full so Tailwind finds every class. Shared with Cluster.
export const gapClasses = {
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
  10: "gap-10",
  14: "gap-14",
};

export type Gap = keyof typeof gapClasses;

const stack = cva("flex flex-col", {
  variants: {
    gap: gapClasses,
    align: { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" },
  },
});

export type StackProps = {
  gap?: Gap;
  align?: "start" | "center" | "end" | "stretch";
  children?: ReactNode;
};

export function Stack({ gap = 4, align = "stretch", children }: StackProps) {
  return <div className={stack({ gap, align })}>{children}</div>;
}
