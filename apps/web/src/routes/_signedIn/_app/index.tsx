import {
  Button,
  Card,
  Cluster,
  Container,
  EmptyState,
  ErrorState,
  Heading,
  LoadingState,
  Split,
  Stack,
  StreakCard,
  Text,
  UnitCard,
  XpChip,
} from "@impromptu/ui";
import { Confetti } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { api } from "../../../api";
import { BuildRoadmap } from "../../../BuildRoadmap";
import { lessonRoute, useNextLesson } from "../../../lessons";
import { progressQuery, roadmapQuery, type Unit } from "../../../queries";

/** Where onboarding continues: no Goals and no Assessment → set Goals, proposed Goals → confirm them, otherwise Home. */
function onboardingRoute(goals: { status: string }[], assessments: { status: string }[]) {
  if (goals.some((g) => g.status === "proposed")) return "/goals/confirm" as const;
  if (!goals.length && !assessments.some((a) => a.status !== "discarded")) return "/goals" as const;
}

export const Route = createFileRoute("/_signedIn/_app/")({
  beforeLoad: async () => {
    const [goals, assessments] = await Promise.all([
      api().api.goals.$get().then((r) => r.json()),
      api().api.assessments.$get().then((r) => r.json()),
    ]);
    const to = onboardingRoute(goals, assessments);
    if (to) throw redirect({ to });
  },
  loader: ({ context }) => context.queryClient.prefetchQuery(roadmapQuery),
  component: Home,
});

function Home() {
  const roadmap = useQuery(roadmapQuery);
  const { data: progress } = useQuery(progressQuery);
  const active = roadmap.data?.find((u) => u.status === "active");

  const main = roadmap.isPending ? (
    <LoadingState title="Loading your Roadmap" />
  ) : roadmap.isError ? (
    <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />
  ) : !roadmap.data.length ? (
    <BuildRoadmap />
  ) : active ? (
    <Stack gap={6}>
      <TodaysLesson unit={active} />
      <UnitCard
        title={active.title}
        objective={active.objective}
        status={active.status}
        render={<Link to="/roadmap/$unitId" params={{ unitId: active.id }} />}
      />
    </Stack>
  ) : (
    <EmptyState
      icon={Confetti}
      title="You've finished your Roadmap"
      description="Every Unit is mastered or skipped. Nice work."
      action={<Button render={<Link to="/roadmap" />}>See your Roadmap</Button>}
    />
  );

  return (
    <Container>
      <Stack gap={6}>
        <Heading level={1}>Home</Heading>
        <Split
          main={
            <Stack gap={6}>
              {main}
              <PractiseRoleplay />
            </Stack>
          }
          side={
            progress && (
              <Stack>
                <StreakCard days={progress.streak} />
                <Cluster>
                  <XpChip xp={progress.xp} />
                </Cluster>
              </Stack>
            )
          }
        />
      </Stack>
    </Container>
  );
}

/** Resumes the Lesson in progress in the active Unit, or starts the next one (which may be its Roleplay). */
function TodaysLesson({ unit }: { unit: Unit }) {
  const next = useNextLesson();
  const current = unit.lessons.find((l) => l.status === "in_progress");

  // Stays up after success too, until the navigation lands.
  if (next.isPending || next.isSuccess)
    return <LoadingState title="Preparing your Lesson" description="It's built from how your last Lessons went." />;
  if (next.isError)
    return <ErrorState title="Your Lesson couldn't be prepared" description="Try again in a moment." onRetry={() => next.mutate()} />;
  return (
    <Card>
      <Stack gap={3} align="start">
        <Text size="label">Today's Lesson</Text>
        <Heading level={2}>{current ? current.title : `Next up in ${unit.title}`}</Heading>
        {current ? (
          <Button render={<Link {...lessonRoute(current)} />}>Resume Lesson</Button>
        ) : (
          <Button onClick={() => next.mutate()}>Start your next Lesson</Button>
        )}
      </Stack>
    </Card>
  );
}

/** A Roleplay can be played any time, not only when a Unit ends with one. */
function PractiseRoleplay() {
  return (
    <Card>
      <Stack gap={3} align="start">
        <Text size="label">Roleplay</Text>
        <Heading level={2}>Practise a Mock Interview or a Client Call</Heading>
        <Text>Your coach stays in character for one of your Goals, and you get a Debrief at the end.</Text>
        <Button variant="secondary" render={<Link to="/roleplays/new" />}>
          Start a Roleplay
        </Button>
      </Stack>
    </Card>
  );
}
