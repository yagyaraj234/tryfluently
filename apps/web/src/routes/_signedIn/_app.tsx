import { AppShell, StreakChip, XpChip, type AppShellDestination } from "@impromptu/ui";
import { ChartLineUp, GearSix, House, MapTrifold } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { progressQuery } from "../../lib/queries";

// Link marks the current destination with aria-current="page".
const destinations: AppShellDestination[] = [
  { label: "Home", icon: House, render: <Link to="/home" /> },
  { label: "Roadmap", icon: MapTrifold, render: <Link to="/roadmap" /> },
  { label: "Progress", icon: ChartLineUp, render: <Link to="/progress" /> },
  { label: "Settings", icon: GearSix, render: <Link to="/settings" /> },
];

/** The signed-in chrome around Home, Roadmap, Progress and Settings. */
export const Route = createFileRoute("/_signedIn/_app")({
  // Never throws: without progress the chrome just leaves the chips out.
  loader: ({ context }) => context.queryClient.prefetchQuery(progressQuery),
  component: AppLayout,
});

function AppLayout() {
  const { data: progress } = useQuery(progressQuery);
  return (
    <AppShell
      destinations={destinations}
      status={
        progress && (
          <>
            <StreakChip days={progress.streak} />
            <XpChip xp={progress.xp} />
          </>
        )
      }
    >
      <Outlet />
    </AppShell>
  );
}
