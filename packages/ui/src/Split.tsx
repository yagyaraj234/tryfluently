import type { ReactNode } from "react";

export type SplitProps = {
  main: ReactNode;
  side: ReactNode;
};

// grid-cols-* use minmax(0, 1fr), so long content can't push a column wider than its share.
export function Split({ main, side }: SplitProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">{main}</div>
      <div>{side}</div>
    </div>
  );
}
