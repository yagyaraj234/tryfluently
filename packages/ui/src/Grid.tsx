import { cva } from "class-variance-authority";
import { Children, type ReactNode } from "react";

// Items stretch, so cards in a row share one height.
const grid = cva("grid gap-4", {
  variants: {
    columns: { 2: "grid-cols-2", responsive: "grid-cols-1 sm:grid-cols-2" },
  },
});

export type GridProps = {
  /** `responsive`: one column on phones, two from `sm`. `2`: always two. @default "responsive" */
  columns?: 2 | "responsive";
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
