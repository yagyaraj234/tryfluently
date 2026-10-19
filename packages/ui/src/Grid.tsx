import { cva } from "class-variance-authority";
import { Children, type ReactNode } from "react";

// Items stretch, so cards in a row share one height.
const grid = cva("gap-4", {
  variants: {
    columns: { 3: "flex flex-wrap *:min-w-0 *:grow *:basis-full sm:*:basis-[calc((100%_-_1rem)/2)] lg:*:basis-[calc((100%_-_2rem)/3)]", 2: "grid grid-cols-2", responsive: "grid grid-cols-1 sm:grid-cols-2" },
  },
});

export type GridProps = {
  /** `responsive`: one column on phones, two from `sm`. `2`: always two. `3`: one on phones, two at `sm`, three at `lg`; the final row fills its width. @default "responsive" */
  columns?: 2 | 3 | "responsive";
  /** Renders an ordered list, each child its own item, for things in sequence like Units. */
  ordered?: boolean;
  children?: ReactNode;
};

/** Equal columns of cards. */
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
