import { MagnifyingGlass } from "@phosphor-icons/react";
import { Container, EmptyState, Screen, Stack } from "@fluently/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { Report } from "../../../components/assessment/assessment";
import { proposedGoals } from "../../../components/assessment/GoalReview";
import {
  FirstUnitCard,
  NextSteps,
  ReportHeader,
  SkillsCard,
  StrengthsCard,
  Weaknesses,
} from "../../../components/assessment/ReportSections";
import { api } from "../../../lib/api";
import { practicePreparationQuery } from "../../../lib/practice-preparation";

/** The Assessment Report reveal. */
export const Route = createFileRoute("/_signedIn/assessments/$assessmentId/report")({
  loader: async ({ params, context }) => {
    const response = await api().api.assessments[":id"].$get({ param: { id: params.assessmentId } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Couldn't load your Assessment Report (${response.status})`);
    const assessment = await response.json();
    if (assessment.status !== "completed") throw redirect({ to: "/assessments/$assessmentId", params });
    const goals = await proposedGoals().catch(() => null);
    if (goals?.length === 0) await context.queryClient.prefetchQuery(practicePreparationQuery);
    return { report: assessment.report as unknown as Report, goals };
  },
  component: AssessmentReport,
});

function AssessmentReport() {
  const data = Route.useLoaderData();
  const report = data?.report;
  const content = report ? (
    <Stack gap={8}>
      <ReportHeader report={report} />
      <SkillsCard report={report} />
      <StrengthsCard report={report} />
      <Weaknesses report={report} />
      <FirstUnitCard report={report} />
      <NextSteps goals={data.goals} />
    </Stack>
  ) : (
    <EmptyState
      icon={MagnifyingGlass}
      title="We couldn't find that Assessment Report"
      description="It may belong to another account."
    />
  );
  return (
    <Screen>
      <Container width="prose">{content}</Container>
    </Screen>
  );
}
