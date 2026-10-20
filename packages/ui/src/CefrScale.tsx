import { cva } from "class-variance-authority";
import type { CefrLevel } from "./SkillBar";

const levels: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2"];

const scale = cva("grid grid-cols-6 gap-1");
const cell = cva("rounded-lg border py-1 text-center text-caption font-semibold", {
  variants: {
    current: {
      true: "border-primary bg-primary-soft text-primary",
      false: "border-line bg-subtle text-muted",
    },
  },
});

export type CefrScaleProps = {
  label: string;
  level: CefrLevel;
};

export function CefrScale({ label, level }: CefrScaleProps) {
  return (
    <ol aria-label={label} className={scale()}>
      {levels.map((l) => (
        <li key={l} aria-current={l === level ? "true" : undefined} className={cell({ current: l === level })}>
          {l}
        </li>
      ))}
    </ol>
  );
}
