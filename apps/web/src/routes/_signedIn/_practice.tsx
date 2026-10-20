import { PracticeShell } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useCanGoBack, useMatch, useRouter } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { roadmapQuery } from "../../lib/queries";

/** Practice screens (Lesson player, Roleplay, live Assessment): no navigation, only a close action. */
export const Route = createFileRoute("/_signedIn/_practice")({ component: PracticeLayout });

function PracticeLayout() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const lesson = useMatch({ from: "/_signedIn/_practice/lessons/$lessonId", shouldThrow: false })?.loaderData;
  const { data: roadmap } = useQuery({ ...roadmapQuery, enabled: !!lesson });
  const title = roadmap?.find((u) => u.id === lesson?.unitId)?.title;

  // Close goes back to where the Learner came from; opened directly, it's a plain link to Home.
  function close(event: MouseEvent) {
    if (!canGoBack) return;
    event.preventDefault();
    router.history.back();
  }

  return (
    <PracticeShell title={title} closeRender={<Link to="/home" />} onClose={close}>
      <Outlet />
    </PracticeShell>
  );
}
