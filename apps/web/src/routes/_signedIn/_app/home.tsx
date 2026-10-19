import {
  Button,
  Card,
  Cluster,
  Dashboard,
  EmptyState,
  ErrorState,
  Grid,
  Heading,
  LoadingState,
  Stack,
  Text,
  UnitCard,
  UnitIcon,
} from "@impromptu/ui";
import { Confetti } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { practicePreparationQuery } from "../../../lib/practice-preparation";
import { api } from "../../../lib/api";
import { BuildRoadmap } from "../../../components/roadmap/BuildRoadmap";
import { LessonAction } from "../../../components/roadmap/LessonAction";
import { roadmapQuery, skillProfileQuery, unitProgress } from "../../../lib/queries";
import { ProfileSummary } from "../../../components/profile/ProfileSummary";

/** Where onboarding continues: no Goals and no Assessment → set Goals, proposed Goals → confirm them, otherwise Home. */
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
  const roadmap = useQuery(roadmapQuery);
  const { learner } = Route.useRouteContext();
  const active = roadmap.data?.find((u) => u.status === "active");
  const upNext = roadmap.data?.filter((u) => u.status === "planned").slice(0, 4) ?? [];

  const continueSlot = roadmap.isPending ? (
    <LoadingState title="Loading your Roadmap" />
  ) : roadmap.isError ? (
    <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />
  ) : !roadmap.data.length ? (
    <BuildRoadmap />
  ) : active ? (
    <UnitCard
      level={3}
      title={active.title}
      objective={active.objective}
      status={active.status}
      number={active.position + 1}
      skill={active.skills[0]}
      progress={unitProgress(active)}
      render={<Link to="/roadmap/$unitId" params={{ unitId: active.id }} />}
      action={<LessonAction unit={active} />}
    />
  ) : (
    <EmptyState
      icon={Confetti}
      title="You've finished your Roadmap"
      description="Every Unit is mastered or skipped. Nice work."
      action={<Button render={<Link to="/roadmap" />}>See your Roadmap</Button>}
    />
  );

  return (
    <Dashboard
      main={
        <>
          <Stack gap={4}>
            <Heading level={2} size="title">
              Continue learning
            </Heading>
            <Grid>
              {active ? continueSlot : <Card size="sm">{continueSlot}</Card>}
              <PractiseRoleplay />
            </Grid>
          </Stack>
          {upNext.length > 0 && (
            <Stack gap={4}>
              <Heading level={2} size="title">
                Up next on your Roadmap
              </Heading>
              <Grid>
                {upNext.map((u) => (
                  <UnitCard
                    key={u.id}
                    cover
                    level={3}
                    title={u.title}
                    objective={u.objective}
                    status={u.status}
                    number={u.position + 1}
                    skill={u.skills[0]}
                    render={<Link to="/roadmap/$unitId" params={{ unitId: u.id }} />}
                  />
                ))}
              </Grid>
            </Stack>
          )}
        </>
      }
      rail={<ProfileSummary name={learner.name} />}
    />
  );
}

/** A Roleplay can be played any time, not only when a Unit ends with one. */
function PractiseRoleplay() {
  return (
    <Card size="sm">
      <Stack gap={4} align="start">
        <Cluster>
          <UnitIcon skill="fluency" />
          <Stack gap={1}>
            <Heading level={3} size="body">
              Mock Interview or Client Call
            </Heading>
            <Text size="label" tone="muted">
              Roleplay
            </Text>
          </Stack>
        </Cluster>
        <Text size="caption" tone="muted">
          Your coach stays in character for one of your Goals, and you get a Debrief at the end.
        </Text>
        <Button size="sm" variant="secondary" render={<Link to="/roleplays/new" />}>
          Start a Roleplay
        </Button>
      </Stack>
    </Card>
  );
}
