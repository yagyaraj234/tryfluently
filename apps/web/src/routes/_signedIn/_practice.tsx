import { PracticeShell } from "@impromptu/ui";
import { createFileRoute, Link, Outlet, useCanGoBack, useRouter } from "@tanstack/react-router";

/** Practice screens (Lesson player, Roleplay, live Assessment): no navigation, only a close action. */
export const Route = createFileRoute("/_signedIn/_practice")({ component: PracticeLayout });

function PracticeLayout() {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  return (
    <PracticeShell
      // Close goes back to where the Learner came from; opened directly, it's a plain link to Home.
      closeRender={<Link to="/" />}
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
