import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { gapClasses, type Gap } from "./Stack";

const cluster = cva("flex", {
  variants: {
    gap: gapClasses,
    wrap: { true: "flex-wrap", false: "flex-nowrap" },
    justify: { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" },
    align: { start: "items-start", center: "items-center", end: "items-end", baseline: "items-baseline" },
  },
});

export type ClusterProps = {
  gap?: Gap;
  wrap?: boolean;
  justify?: "start" | "center" | "end" | "between";
  align?: "start" | "center" | "end" | "baseline";
  children?: ReactNode;
};

export function Cluster({ wrap = true, gap = 2, justify = "start", align = "center", children }: ClusterProps) {
  return <div className={cluster({ wrap, gap, justify, align })}>{children}</div>;
}
