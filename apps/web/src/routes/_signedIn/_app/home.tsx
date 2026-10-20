import { Dashboard } from "@fluently/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { practicePreparationQuery } from "../../../lib/practice-preparation";
import { api } from "../../../lib/api";
import { ContinueLearning } from "../../../components/home/ContinueLearning";
import { UpNext } from "../../../components/home/UpNext";
import { roadmapQuery, skillProfileQuery } from "../../../lib/queries";
import { ProfileSummary } from "../../../components/profile/ProfileSummary";

function onboardingRoute(goals: { status: string }[], assessments: { status: string }[]) {
  if (goals.some((g) => g.status === "proposed")) return "/goals/confirm" as const;
  if (!goals.length && !assessments.some((a) => a.status !== "discarded")) return "/goals" as const;
}

export const Route = createFileRoute("/_signedIn/_app/home")({
  staticData: { title: "Home" },
  beforeLoad: async () => {
    const [goals, assessments] = await Promise.all([
      api()
        .api.goals.$get()
        .then((r) => r.json()),
      api()
        .api.assessments.$get()
        .then((r) => r.json()),
    ]);
    const to = onboardingRoute(goals, assessments);
    if (to) throw redirect({ to });
  },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(roadmapQuery),
      context.queryClient.prefetchQuery(skillProfileQuery),
      context.queryClient.prefetchQuery(practicePreparationQuery),
    ]),
  component: Home,
});

function Home() {
  const { learner } = Route.useRouteContext();
  return (
    <Dashboard
      main={
        <>
          <ContinueLearning />
          <UpNext />
        </>
      }
      rail={<ProfileSummary name={learner.name} />}
    />
  );
}
