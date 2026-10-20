import {
  Button,
  Card,
  Cluster,
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
import { Link } from "@tanstack/react-router";
import { roadmapQuery, unitProgress } from "../../lib/queries";
import { BuildRoadmap } from "../roadmap/BuildRoadmap";
import { LessonAction } from "../roadmap/LessonAction";

function ActiveUnit() {
  const roadmap = useQuery(roadmapQuery);
  const active = roadmap.data?.find((u) => u.status === "active");

  if (roadmap.isPending)
    return (
      <Card size="sm">
        <LoadingState title="Loading your Roadmap" />
      </Card>
    );
  if (roadmap.isError)
    return (
      <Card size="sm">
        <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />
      </Card>
    );
  if (!roadmap.data.length)
    return (
      <Card size="sm">
        <BuildRoadmap compact />
      </Card>
    );
  if (!active)
    return (
      <Card size="sm">
        <EmptyState
          icon={Confetti}
          title="You've finished your Roadmap"
          description="Every Unit is mastered or skipped. Nice work."
          action={<Button render={<Link to="/roadmap" />}>See your Roadmap</Button>}
        />
      </Card>
    );

  return (
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
  );
}

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

export function ContinueLearning() {
  return (
    <Stack gap={4}>
      <Heading level={2} size="title">
        Continue learning
      </Heading>
      <Grid>
        <ActiveUnit />
        <PractiseRoleplay />
      </Grid>
    </Stack>
  );
}
