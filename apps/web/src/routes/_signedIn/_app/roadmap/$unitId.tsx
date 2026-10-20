import { BookOpen, MapTrifold } from "@phosphor-icons/react";
import {
  Card,
  CardList,
  Chip,
  Cluster,
  EmptyState,
  ErrorState,
  Heading,
  LoadingState,
  Meter,
  Stack,
  Text,
  TextLink,
  UnitIcon,
  UnitStatusTag,
} from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LessonAction } from "../../../../components/roadmap/LessonAction";
import { roadmapQuery, type Unit } from "../../../../lib/queries";

export const Route = createFileRoute("/_signedIn/_app/roadmap/$unitId")({
  loader: ({ context }) => context.queryClient.prefetchQuery(roadmapQuery),
  component: UnitView,
});

type Lesson = Unit["lessons"][number];

function lessonLink(l: Lesson) {
  if (l.kind === "roleplay") return <Link to="/roleplays/$roleplayId" params={{ roleplayId: l.id }} />;
  return <Link to="/lessons/$lessonId" params={{ lessonId: l.id }} />;
}

const skillNames = { fluency: "Fluency", grammar: "Grammar", vocabulary: "Vocabulary" };

function UnitView() {
  const { unitId } = Route.useParams();
  const roadmap = useQuery(roadmapQuery);
  const unit = roadmap.data?.find((u) => u.id === unitId);

  let body;
  if (roadmap.isPending) body = <LoadingState title="Loading this Unit" />;
  else if (roadmap.isError) body = <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />;
  else if (unit) body = <UnitDetails unit={unit} />;
  else
    body = (
      <EmptyState
        icon={MapTrifold}
        title="This Unit isn't on your Roadmap"
        description="Your Roadmap may have been revised since."
      />
    );

  return (
    <Stack gap={6}>
      <Cluster>
        <TextLink render={<Link to="/roadmap" activeOptions={{ exact: true }} />}>Back to Roadmap</TextLink>
      </Cluster>
      {body}
    </Stack>
  );
}

function UnitDetails({ unit }: { unit: Unit }) {
  const past = unit.lessons.filter((l) => l.status === "completed");
  const roleplayNote = unit.endsWithRoleplay
    ? "Ends with a Roleplay after its practice Lessons."
    : "No Roleplay in this Unit.";
  const lessons = past.length ? (
    <CardList>
      {past.map((l) => (
        <Stack key={l.id} gap={2}>
          <TextLink render={lessonLink(l)}>{l.title}</TextLink>
          <Meter label="Objective progress" value={l.objectiveProgress ?? 0} />
        </Stack>
      ))}
    </CardList>
  ) : (
    <EmptyState
      icon={BookOpen}
      title="No Lessons yet"
      description="Lessons appear here once you start this Unit and finish them."
    />
  );
  return (
    <Stack gap={8}>
      <Card>
        <Stack gap={3} align="start">
          <Cluster>
            <UnitIcon skill={unit.skills[0]} />
            <UnitStatusTag status={unit.status} />
          </Cluster>
          <Heading level={1}>{unit.title}</Heading>
          <Text>{unit.objective}</Text>
          <Cluster>
            {unit.skills.map((s) => (
              <Chip key={s}>{skillNames[s]}</Chip>
            ))}
          </Cluster>
          <Text tone="muted">{roleplayNote}</Text>
          {unit.status === "active" && <LessonAction unit={unit} />}
        </Stack>
      </Card>
      <Stack gap={4}>
        <Stack gap={1}>
          <Heading level={2}>Lessons</Heading>
          <Text tone="muted">How close each finished Lesson came to the objective.</Text>
        </Stack>
        {lessons}
      </Stack>
    </Stack>
  );
}
