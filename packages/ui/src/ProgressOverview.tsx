import { Meter } from "@base-ui/react/meter";
import { cva } from "class-variance-authority";
import type { ReactNode } from "react";
import { Card } from "./Card";
import { CefrScale } from "./CefrScale";
import { Chip } from "./Chip";
import { Cluster } from "./Cluster";
import { EmptyState } from "./States";
import { Heading } from "./Heading";
import { ScoreHistory, type ScoreHistoryEntry } from "./ScoreHistory";
import { skillNames, type Skill, type CefrLevel } from "./SkillBar";
import { Stack } from "./Stack";
import { Text } from "./Text";

const skillColor = cva("", {
  variants: {
    skill: { fluency: "text-skill-fluency", grammar: "text-skill-grammar", vocabulary: "text-skill-vocabulary" },
  },
});

export function ProgressOverview({
  skills,
  focus,
  assessment,
}: {
  skills: ReactNode;
  focus: ReactNode;
  assessment: ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:col-span-3 lg:grid-cols-3">{skills}</div>
      <aside aria-label="Assessment" className="min-w-0 lg:col-span-3">
        {assessment}
      </aside>
      <section aria-label="Focus Items" className="min-w-0 lg:col-span-3">
        {focus}
      </section>
    </div>
  );
}

export function ProgressCheckIn({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <Card>
      <div className="grid items-center gap-6 md:grid-cols-2">
        <Stack gap={2}>{children}</Stack>
        <div className="min-w-0 border-line md:border-l md:pl-6">{action}</div>
      </div>
    </Card>
  );
}

export type SkillProgressCardProps = {
  skill: Skill;
  current: { score: number; level: CefrLevel } | null;
  entries: readonly ScoreHistoryEntry[];
  unmeasured: string;
};

function deltaText(delta: number | null) {
  if (delta === null) return "Your starting point";
  if (delta === 0) return "No change since first score";
  return `${delta > 0 ? "+" : ""}${delta} ${Math.abs(delta) === 1 ? "point" : "points"} since first score`;
}

function ScoreMeter({ name, skill, score, level }: { name: string; skill: Skill; score: number; level: CefrLevel }) {
  return (
    <Meter.Root value={score} max={100} aria-label={name} getAriaValueText={() => `${score}, ${level}`}>
      <div className="mb-4 flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1 tabular-nums">
          <span className="text-hero">{score}</span>
          <span className="text-caption text-muted">/ 100</span>
        </div>
        <Chip tone="soft">{level}</Chip>
      </div>
      <Meter.Track className="h-1.5 overflow-hidden rounded-full bg-subtle">
        <Meter.Indicator className={`h-full rounded-full bg-current ${skillColor({ skill })}`} />
      </Meter.Track>
    </Meter.Root>
  );
}

function TrendChart({ name, skill, entries }: { name: string; skill: Skill; entries: readonly ScoreHistoryEntry[] }) {
  const oldestFirst = [...entries].reverse();
  const scores = oldestFirst.map((entry) => entry.score).join(", ");
  const points = oldestFirst
    .map((entry, index) => `${4 + (index * 232) / (entries.length - 1)},${68 - entry.score * 0.64}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 240 72"
      role="img"
      aria-label={`${name} scores, oldest to newest: ${scores}. Scale 0 to 100.`}
      className={`h-20 w-full ${skillColor({ skill })}`}
    >
      <path d="M 4 68 H 236" stroke="var(--color-line)" fill="none" />
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="236" cy={68 - entries[0]!.score * 0.64} r="3" fill="currentColor" />
    </svg>
  );
}

function TrendSection({ name, skill, entries }: { name: string; skill: Skill; entries: readonly ScoreHistoryEntry[] }) {
  const delta = entries.length > 1 ? entries[0]!.score - entries.at(-1)!.score : null;
  const hasTrend = entries.length > 1;
  const chart = hasTrend ? (
    <TrendChart name={name} skill={skill} entries={entries} />
  ) : (
    <Text size="caption" tone="muted">
      Keep practising to see your trend.
    </Text>
  );
  return (
    <div className="border-t border-line pt-4">
      <Stack gap={2}>
        <Text size="caption" tone="muted">
          {deltaText(delta)}
        </Text>
        {chart}
        {hasTrend && (
          <Text size="caption" tone="muted">
            {entries.length} measurements · oldest to newest
          </Text>
        )}
      </Stack>
    </div>
  );
}

function HistoryDetails({ name, entries }: { name: string; entries: readonly ScoreHistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <details className="min-w-0 border-t border-line pt-3">
      <summary className="cursor-pointer rounded-lg text-caption font-semibold text-ink">Score history</summary>
      <div className="overflow-x-auto pt-3">
        <ScoreHistory label={`${name} history`} entries={entries} />
      </div>
    </details>
  );
}

export function SkillProgressCard({ skill, current, entries, unmeasured }: SkillProgressCardProps) {
  const name = skillNames[skill];
  const body = current ? (
    <>
      <ScoreMeter name={name} skill={skill} score={current.score} level={current.level} />
      <CefrScale label={`${name} CEFR Level`} level={current.level} />
      <TrendSection name={name} skill={skill} entries={entries} />
      <HistoryDetails name={name} entries={entries} />
    </>
  ) : (
    <EmptyState title={`No ${name.toLowerCase()} score yet`} description={unmeasured} />
  );
  return (
    <Card>
      <Stack gap={5}>
        <Cluster justify="between">
          <Heading level={3} size="body">
            {name}
          </Heading>
          <Text size="caption" tone="muted">
            {current ? "Measured" : "Not measured"}
          </Text>
        </Cluster>
        {body}
      </Stack>
    </Card>
  );
}
