import { MagnifyingGlass } from "@phosphor-icons/react";
import { ChatSkeleton, EmptyState } from "@fluently/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Discarded } from "../../../../components/assessment/assessment";
import { VoiceAssessment } from "../../../../components/assessment/VoiceAssessment";
import { WrittenAssessment } from "../../../../components/assessment/WrittenAssessment";
import { api } from "../../../../lib/api";

export const Route = createFileRoute("/_signedIn/_practice/assessments/$assessmentId")({
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ params }) => {
      const response = await api().api.assessments[":id"].$get({ param: { id: params.assessmentId } });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Couldn't load your Assessment (${response.status})`);
      const assessment = await response.json();
      if (assessment.status === "completed") throw redirect({ to: "/assessments/$assessmentId/report", params });
      return assessment;
    },
  },
  component: AssessmentScreen,
  pendingComponent: AssessmentPending,
});

function AssessmentPending() {
  return <ChatSkeleton label="Loading your Assessment" />;
}

/** One route for both modes: the Written and the Voice Assessment. */
function AssessmentScreen() {
  const assessment = Route.useLoaderData();
  if (!assessment)
    return (
      <EmptyState
        icon={MagnifyingGlass}
        title="We couldn't find that Assessment"
        description="It may belong to another account."
      />
    );
  if (assessment.status === "discarded") return <Discarded />;
  if (assessment.mode === "written") return <WrittenAssessment key={assessment.id} assessment={assessment} />;
  return <VoiceAssessment key={assessment.id} assessment={assessment} />;
}
