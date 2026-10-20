import { cva } from "class-variance-authority";
import { Children, type ReactNode } from "react";

const grid = cva("gap-4", {
  variants: {
    columns: {
      3: "flex flex-wrap *:min-w-0 *:grow *:basis-full sm:*:basis-[calc((100%_-_1rem)/2)] lg:*:basis-[calc((100%_-_2rem)/3)]",
      2: "grid grid-cols-2",
      responsive: "grid grid-cols-1 sm:grid-cols-2",
    },
  },
});

export type GridProps = {
  columns?: 2 | 3 | "responsive";
  ordered?: boolean;
  children?: ReactNode;
};

export function Grid({ columns = "responsive", ordered, children }: GridProps) {
  if (!ordered) return <div className={grid({ columns })}>{children}</div>;
  return (
    <ol className={grid({ columns })}>
      {Children.map(children, (child) => (
        <li className="grid">{child}</li>
      ))}
    </ol>
  );
}
