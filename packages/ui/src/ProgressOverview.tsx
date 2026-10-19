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
  variants: { skill: { fluency: "text-skill-fluency", grammar: "text-skill-grammar", vocabulary: "text-skill-vocabulary" } },
});

/** Full-width rows keep long Focus Item collections from leaving an empty side column. */
export function ProgressOverview({ skills, focus, assessment }: { skills: ReactNode; focus: ReactNode; assessment: ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:col-span-3 lg:grid-cols-3">{skills}</div>
      <aside aria-label="Assessment" className="min-w-0 lg:col-span-3">{assessment}</aside>
      <section aria-label="Focus Items" className="min-w-0 lg:col-span-3">{focus}</section>
    </div>
  );
}

/** A compact check-in row with supporting copy beside its action. */
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
  /** Newest first, like the history table. */
  entries: readonly ScoreHistoryEntry[];
  unmeasured: string;
};

export function SkillProgressCard({ skill, current, entries, unmeasured }: SkillProgressCardProps) {
  const name = skillNames[skill];
  const delta = entries.length > 1 ? entries[0]!.score - entries.at(-1)!.score : null;
  return (
    <Card>
      <Stack gap={5}>
        <Cluster justify="between">
          <Heading level={3} size="body">{name}</Heading>
          <Text size="caption" tone="muted">{current ? "Measured" : "Not measured"}</Text>
        </Cluster>
        {current ? (
          <>
            <Meter.Root value={current.score} max={100} aria-label={name} getAriaValueText={() => `${current.score}, ${current.level}`}>
              <div className="mb-4 flex items-end justify-between gap-2">
                <div className="flex items-baseline gap-1 tabular-nums">
                  <span className="text-hero">{current.score}</span>
                  <span className="text-caption text-muted">/ 100</span>
                </div>
                <Chip tone="soft">{current.level}</Chip>
              </div>
              <Meter.Track className="h-1.5 overflow-hidden rounded-full bg-subtle">
                <Meter.Indicator className={`h-full rounded-full bg-current ${skillColor({ skill })}`} />
              </Meter.Track>
            </Meter.Root>
            <CefrScale label={`${name} CEFR Level`} level={current.level} />
            <div className="rounded-2xl bg-subtle p-3">
              <Stack gap={2}>
                <Text size="caption" tone="muted">
                  {delta === null ? "Your starting point" : delta === 0 ? "No change since first score" : `${delta > 0 ? "+" : ""}${delta} ${Math.abs(delta) === 1 ? "point" : "points"} since first score`}
                </Text>
                {entries.length > 1 ? (
                  <svg viewBox="0 0 240 72" role="img" aria-label={`${name} scores, oldest to newest: ${[...entries].reverse().map((entry) => entry.score).join(", ")}. Scale 0 to 100.`} className={`h-20 w-full ${skillColor({ skill })}`}>
                    <path d="M 4 68 H 236" stroke="var(--color-line)" fill="none" />
                    <polyline
                      points={[...entries].reverse().map((entry, index) => `${4 + index * 232 / (entries.length - 1)},${68 - entry.score * 0.64}`).join(" ")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="236" cy={68 - entries[0]!.score * 0.64} r="3" fill="currentColor" />
                  </svg>
                ) : (
                  <Text size="caption" tone="muted">Keep practising to see your trend.</Text>
                )}
                {entries.length > 1 && <Text size="caption" tone="muted">{entries.length} measurements · oldest to newest</Text>}
              </Stack>
            </div>
            {entries.length > 0 && (
              <details className="min-w-0 border-t border-line pt-3">
                <summary className="cursor-pointer rounded-lg text-caption font-semibold text-ink">Score history</summary>
                <div className="overflow-x-auto pt-3">
                  <ScoreHistory label={`${name} history`} entries={entries} />
                </div>
              </details>
            )}
          </>
        ) : (
          <EmptyState title={`No ${name.toLowerCase()} score yet`} description={unmeasured} />
        )}
      </Stack>
    </Card>
  );
}
