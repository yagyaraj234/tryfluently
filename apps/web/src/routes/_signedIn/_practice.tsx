import { PracticeShell } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useCanGoBack, useMatch, useRouter } from "@tanstack/react-router";
import { roadmapQuery } from "../../lib/queries";

/** Practice screens (Lesson player, Roleplay, live Assessment): no navigation, only a close action. */
export const Route = createFileRoute("/_signedIn/_practice")({ component: PracticeLayout });

function PracticeLayout() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  // A Lesson is named by its Unit.
  const lesson = useMatch({ from: "/_signedIn/_practice/lessons/$lessonId", shouldThrow: false })?.loaderData;
  const { data: roadmap } = useQuery({ ...roadmapQuery, enabled: !!lesson });
  return (
    <PracticeShell
      title={roadmap?.find((u) => u.id === lesson?.unitId)?.title}
      // Close goes back to where the Learner came from; opened directly, it's a plain link to Home.
      closeRender={<Link to="/home" />}
      onClose={(event) => {
        if (!canGoBack) return;
        event.preventDefault();
        router.history.back();
      }}
    >
      <Outlet />
    </PracticeShell>
  );
}
