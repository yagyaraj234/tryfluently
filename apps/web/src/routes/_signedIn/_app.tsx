import { AppShell, StreakChip, XpChip, type AppShellDestination } from "@impromptu/ui";
import { ChartLineUp, UserCircle, House, MapTrifold, Chats } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { usePracticePreparation } from "../../lib/practice-preparation";
import { progressQuery } from "../../lib/queries";

const destinations: AppShellDestination[] = [
  { label: "Home", icon: House, render: <Link to="/home" /> },
  { label: "Roadmap", icon: MapTrifold, render: <Link to="/roadmap" /> },
  { label: "Roleplays", icon: Chats, render: <Link to="/roleplays" /> },
  { label: "Progress", icon: ChartLineUp, render: <Link to="/progress" /> },
  { label: "Profile", icon: UserCircle, render: <Link to="/profile" /> },
];

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** The page's heading in the top bar. Without one, the page shows its own `h1`. */
    title?: string;
  }
}

export const Route = createFileRoute("/_signedIn/_app")({
  // Never throws: without progress the chrome just leaves the chips out.
  loader: ({ context }) => context.queryClient.prefetchQuery(progressQuery),
  component: AppLayout,
});

function AppLayout() {
  usePracticePreparation();
  const { learner } = Route.useRouteContext();
  const { data: progress } = useQuery(progressQuery);
  const title = useMatches({ select: (matches) => matches.at(-1)?.staticData.title });
  const heading = title === "Home" ? `Welcome back, ${learner.name}` : title;
  const status = progress && (
    <>
      <StreakChip days={progress.streak} />
      <XpChip xp={progress.xp} />
    </>
  );
  return (
    <AppShell destinations={destinations} title={heading} status={status}>
      <Outlet />
    </AppShell>
  );
}
