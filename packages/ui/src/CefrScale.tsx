import { cva } from "class-variance-authority";
import type { CefrLevel } from "./SkillBar";

const levels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

const scale = cva("grid grid-cols-6 gap-1");
// Ink text on the light cells (A1–B1), on-primary text on the dark ones (B2–C2).
const cell = cva("rounded-sm py-1 text-center text-caption font-bold", {
  variants: {
    level: {
      A1: "bg-cefr-a1 text-ink",
      A2: "bg-cefr-a2 text-ink",
      B1: "bg-cefr-b1 text-ink",
      B2: "bg-cefr-b2 text-on-primary",
      C1: "bg-cefr-c1 text-on-primary",
      C2: "bg-cefr-c2 text-on-primary",
    },
    current: { true: "outline-2 outline-offset-1 outline-line motion-safe:animate-celebrate" },
  },
});

export type CefrScaleProps = {
  /** The list's accessible name, for example "Grammar CEFR Level". */
  label: string;
  level: CefrLevel;
};

/** The six CEFR Levels, darker from A1 to C2, with the current Level outlined. */
export function CefrScale({ label, level }: CefrScaleProps) {
  return (
    <ol aria-label={label} className={scale()}>
      {levels.map((l) => (
        <li key={l} aria-current={l === level ? "true" : undefined} className={cell({ level: l, current: l === level })}>
          {l}
        </li>
      ))}
    </ol>
  );
}
