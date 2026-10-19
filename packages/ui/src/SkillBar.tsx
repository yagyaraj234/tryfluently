import { Meter } from "@base-ui/react/meter";
import { cva } from "class-variance-authority";
import { labelledBarParts } from "./ProgressBar";

export type Skill = "fluency" | "grammar" | "vocabulary";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const skillNames: Record<Skill, string> = { fluency: "Fluency", grammar: "Grammar", vocabulary: "Vocabulary" };

const indicator = cva("block h-full", {
  variants: {
    skill: { fluency: "bg-skill-fluency", grammar: "bg-skill-grammar", vocabulary: "bg-skill-vocabulary" },
  },
});

export type SkillBarProps = {
  skill: Skill;
  /** 0–100, rounded. */
  score: number;
  level: CefrLevel;
};

/** One skill of the Skill Profile: the name on the left, the score and CEFR Level on the right, a bar in the skill colour. */
export function SkillBar({ skill, score, level }: SkillBarProps) {
  return (
    <Meter.Root className={labelledBarParts.root()} value={score} max={100} getAriaValueText={() => `${score}, ${level}`}>
      <Meter.Label className={labelledBarParts.label()}>{skillNames[skill]}</Meter.Label>
      <span className={labelledBarParts.value()}>
        {score} · {level}
      </span>
      <Meter.Track className={labelledBarParts.track()}>
        <Meter.Indicator className={indicator({ skill })} />
      </Meter.Track>
    </Meter.Root>
  );
}
