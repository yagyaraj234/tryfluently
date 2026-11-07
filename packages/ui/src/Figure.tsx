import { cva } from "class-variance-authority";

const value = cva("text-page tabular-nums");
const label = cva("text-caption text-muted");

export type FigureProps = {
  value: string;
  label: string;
};

/** One number that answers a question, set large with a plain-words label under it. */
export function Figure({ value: n, label: text }: FigureProps) {
  return (
    <p className="flex flex-col">
      <span className={value()}>{n}</span> <span className={label()}>{text}</span>
    </p>
  );
}
