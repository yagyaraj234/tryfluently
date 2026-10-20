import { Stack } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";
import { ProgressContent } from "../../../components/progress/ProgressContent";
import {
  assessmentsQuery,
  focusItemsQuery,
  reportsQuery,
  skillHistoryQuery,
  skillProfileQuery,
} from "../../../lib/queries";

/** The Skill Profile with each skill's history, the Focus Items and retaking the Assessment. */
export const Route = createFileRoute("/_signedIn/_app/progress")({
  staticData: { title: "Progress" },
  // Never throws: a failed query shows its error state in the page.
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.prefetchQuery(skillProfileQuery),
      queryClient.prefetchQuery(skillHistoryQuery),
      queryClient.prefetchQuery(focusItemsQuery),
      queryClient.prefetchQuery(assessmentsQuery),
      queryClient.prefetchQuery(reportsQuery),
    ]),
  component: Progress,
});

function Progress() {
  const { learner } = Route.useRouteContext();
  return (
    <Stack gap={8}>
      <ProgressContent timeZone={learner.timezone} />
    </Stack>
  );
}
