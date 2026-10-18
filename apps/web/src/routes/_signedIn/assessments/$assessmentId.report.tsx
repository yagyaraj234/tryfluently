import {
  Button,
  Card,
  CefrScale,
  Container,
  EmptyState,
  Heading,
  Notice,
  ReportStrengths,
  ReportWeakness,
  Screen,
  SkillBar,
  Stack,
  Text,
} from "@impromptu/ui";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { api } from "../../../lib/api";
import type { Report } from "../../../components/assessment/assessment";

/** The Assessment Report reveal, on the loud surface. */
export const Route = createFileRoute("/_signedIn/assessments/$assessmentId/report")({
  loader: async ({ params }) => {
    const response = await api().api.assessments[":id"].$get({ param: { id: params.assessmentId } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Couldn't load your Assessment Report (${response.status})`);
    const assessment = await response.json();
    if (assessment.status !== "completed") throw redirect({ to: "/assessments/$assessmentId", params });
    return assessment.report as unknown as Report;
  },
  component: AssessmentReport,
});

const skills = ["grammar", "vocabulary", "fluency"] as const;

function AssessmentReport() {
  const report = Route.useLoaderData();
  return (
    <Screen surface="loud">
      <Container width="prose">
        {report ? (
          <Stack gap={8}>
            <Stack gap={4}>
              <Text size="label">Your Assessment Report</Text>
              <Heading level={1}>Your English level</Heading>
              <Text size="hero">{report.overallLevel}</Text>
              <CefrScale label="Overall CEFR Level" level={report.overallLevel} />
              {report.partial && (
                <Notice tone="info">
                  This Report is partial: you left before the end, so it's based on less of your English than usual.
                </Notice>
              )}
            </Stack>
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
            <Card>
              <Stack gap={4}>
                <Heading level={2} size="title">
                  What you do well
                </Heading>
                <ReportStrengths strengths={report.strengths} />
              </Stack>
            </Card>
            <Stack gap={4}>
              <Heading level={2}>What to work on</Heading>
              {report.weaknesses.map((w) => (
                <ReportWeakness key={w.label} label={w.label} quote={w.quote} betterVersion={w.betterVersion} />
              ))}
            </Stack>
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
            {/* Home sends the Learner on to confirm proposed Goals first. */}
            <Button fullWidth render={<Link to="/" />}>
              Continue
            </Button>
          </Stack>
        ) : (
          <EmptyState title="We couldn't find that Assessment Report" description="It may belong to another account." />
        )}
      </Container>
    </Screen>
  );
}
