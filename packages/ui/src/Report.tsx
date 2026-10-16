import { Meter as BaseMeter } from "@base-ui/react/meter";
import { Check } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { Card } from "./Card";
import { Heading } from "./Heading";
import { labelledBarParts } from "./ProgressBar";
import { Text } from "./Text";

// The Skill Profile and Assessment Report pieces.

export const cefrLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof cefrLevels)[number];
export type Skill = "fluency" | "grammar" | "vocabulary";

const skillNames: Record<Skill, string> = { fluency: "Fluency", grammar: "Grammar", vocabulary: "Vocabulary" };

const skillIndicator = cva("block h-full motion-safe:transition-all motion-safe:duration-ui motion-safe:ease-ui", {
  variants: {
    skill: { fluency: "bg-skill-fluency", grammar: "bg-skill-grammar", vocabulary: "bg-skill-vocabulary" },
  },
});

export type SkillBarProps = {
  skill: Skill;
  /** 0–100. */
  score: number;
  level: CefrLevel;
};

/** One skill's score out of 100 and its CEFR Level, in the skill's chart colour. */
export function SkillBar({ skill, score, level }: SkillBarProps) {
  return (
    <BaseMeter.Root className={labelledBarParts.root()} value={score} getAriaValueText={() => `${score} out of 100, ${level}`}>
      <BaseMeter.Label className={labelledBarParts.label()}>{skillNames[skill]}</BaseMeter.Label>
      <span className={labelledBarParts.value()}>
        {score} · {level}
      </span>
      <BaseMeter.Track className={labelledBarParts.track()}>
        <BaseMeter.Indicator className={skillIndicator({ skill })} />
      </BaseMeter.Track>
    </BaseMeter.Root>
  );
}

// Ink text on A1–B1, on-primary text on the darker B2–C2.
const cell = cva("flex min-h-target flex-1 items-center justify-center rounded-sm text-caption font-bold", {
  variants: {
    level: {
      A1: "bg-cefr-a1 text-ink",
      A2: "bg-cefr-a2 text-ink",
      B1: "bg-cefr-b1 text-ink",
      B2: "bg-cefr-b2 text-on-primary",
      C1: "bg-cefr-c1 text-on-primary",
      C2: "bg-cefr-c2 text-on-primary",
    },
    current: { true: "outline-2 outline-offset-1 outline-ink" },
  },
});

export type CefrScaleProps = {
  level: CefrLevel;
};

/** The six CEFR Levels, with the current one outlined. */
export function CefrScale({ level }: CefrScaleProps) {
  return (
    <ol aria-label="CEFR Level" className="flex gap-1">
      {cefrLevels.map((l) => (
        <li key={l} aria-current={l === level ? "true" : undefined} className={cell({ level: l, current: l === level })}>
          {l}
        </li>
      ))}
    </ol>
  );
}

export type ReportStrengthsProps = {
  strengths: string[];
};

/** What the Learner does well. */
export function ReportStrengths({ strengths }: ReportStrengthsProps) {
  return (
    <ul className="flex flex-col gap-3">
      {strengths.map((s) => (
        <li key={s} className="flex items-start gap-3 text-body text-ink">
          <Check aria-hidden className="mt-1 shrink-0 text-correct" />
          {s}
        </li>
      ))}
    </ul>
  );
}

export type ReportWeaknessProps = {
  label: string;
  /** What the Learner said. */
  quote: string;
  betterVersion: string;
};

/** One weakness: what the Learner said and a better way to say it. */
export function ReportWeakness({ label, quote, betterVersion }: ReportWeaknessProps) {
  return (
    <Card>
      <div className="flex flex-col gap-3">
        <Heading level={3}>{label}</Heading>
        <Text size="label" tone="muted">
          You said
        </Text>
        <blockquote className="rounded-md bg-subtle px-4 py-3 text-body text-ink">{quote}</blockquote>
        <Text size="label" tone="muted">
          Better
        </Text>
        <p className="text-body font-bold text-ink">{betterVersion}</p>
      </div>
    </Card>
  );
}
