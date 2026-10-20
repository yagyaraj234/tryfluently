import {
  Card,
  CefrScale,
  Heading,
  Notice,
  ReportStrengths,
  ReportWeakness,
  SkillBar,
  Stack,
  Text,
  TextLink,
} from "@fluently/ui";
import { Link } from "@tanstack/react-router";
import { BuildRoadmap } from "../roadmap/BuildRoadmap";
import { GoalReview, type proposedGoals } from "./GoalReview";
import type { Report } from "./assessment";

const skills = ["grammar", "vocabulary", "fluency"] as const;

export function ReportHeader({ report }: { report: Report }) {
  return (
    <Stack gap={4}>
      <Text size="label">Your Assessment Report</Text>
      <Heading level={1}>Your English level</Heading>
      <Text size="hero">{report.overallLevel}</Text>
      <CefrScale label="Overall CEFR Level" level={report.overallLevel} />
      {report.partial && (
        <Notice tone="info">
          You left before the end, so this Report is partial. It is based on less of your English than usual.
        </Notice>
      )}
    </Stack>
  );
}

export function SkillsCard({ report }: { report: Report }) {
  return (
    <Card>
      <Stack gap={4}>
        <Heading level={2} size="title">
          Your skills
        </Heading>
        {skills.map((skill) => {
          const result = report.skills[skill];
          return result ? (
            <SkillBar key={skill} skill={skill} score={result.score} level={result.level} />
          ) : (
            <Stack key={skill} gap={1}>
              <Text size="caption">Fluency</Text>
              <Text size="caption" tone="muted">
                Not measured yet. It's measured once you speak, in a Voice Assessment or a Lesson.
              </Text>
            </Stack>
          );
        })}
      </Stack>
    </Card>
  );
}

export function StrengthsCard({ report }: { report: Report }) {
  return (
    <Card>
      <Stack gap={4}>
        <Heading level={2} size="title">
          What you do well
        </Heading>
        <ReportStrengths strengths={report.strengths} />
      </Stack>
    </Card>
  );
}

export function Weaknesses({ report }: { report: Report }) {
  return (
    <Stack gap={4}>
      <Heading level={2}>What to work on</Heading>
      {report.weaknesses.map((w) => (
        <ReportWeakness key={w.label} label={w.label} quote={w.quote} betterVersion={w.betterVersion} />
      ))}
    </Stack>
  );
}

export function FirstUnitCard({ report }: { report: Report }) {
  return (
    <Card>
      <Stack gap={3}>
        <Text size="label" tone="muted">
          Your first Unit
        </Text>
        <Heading level={2} size="title">
          {report.firstUnit.title}
        </Heading>
        <Text>{report.firstUnit.objective}</Text>
      </Stack>
    </Card>
  );
}

export function NextSteps({ goals }: { goals: Awaited<ReturnType<typeof proposedGoals>> | null }) {
  if (goals === null)
    return (
      <Notice tone="error">
        Your Assessment Report is ready, but your Goal suggestions couldn’t be loaded.{" "}
        <TextLink render={<Link to="/goals/confirm" />}>Review your Goals</TextLink>
      </Notice>
    );
  if (goals.length) return <GoalReview initialGoals={goals} />;
  return <BuildRoadmap />;
}
