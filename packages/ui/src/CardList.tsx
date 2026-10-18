import { Children, type ReactNode } from "react";

export type CardListProps = {
  children?: ReactNode;
};

/** Rows on one card, split by hairlines, for example a Unit's finished Lessons. */
export function CardList({ children }: CardListProps) {
  return (
    <ol className="flex flex-col divide-y divide-line rounded-3xl border border-line bg-paper text-ink shadow-card">
      {Children.map(children, (child) => (
        <li className="p-4">{child}</li>
      ))}
    </ol>
  );
}
