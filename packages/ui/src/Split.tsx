import type { ReactNode } from "react";

export type SplitProps = {
  main: ReactNode;
  side: ReactNode;
};

// One column on phones; at desktop the main slot takes two thirds and the side slot one.
// grid-cols-* use minmax(0, 1fr), so long content can't push a column wider than its share.
export function Split({ main, side }: SplitProps) {
  return (
    <div className="grid grid-cols-1 gap-8 desktop:grid-cols-3">
      <div className="desktop:col-span-2">{main}</div>
      <div>{side}</div>
    </div>
  );
}
