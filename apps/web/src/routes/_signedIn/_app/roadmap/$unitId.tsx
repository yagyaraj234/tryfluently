import {
  Card,
  CardList,
  Chip,
  Cluster,
  Container,
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

const skillNames = { fluency: "Fluency", grammar: "Grammar", vocabulary: "Vocabulary" };

function UnitView() {
  const { unitId } = Route.useParams();
  const roadmap = useQuery(roadmapQuery);
  const unit = roadmap.data?.find((u) => u.id === unitId);
  return (
    <Container>
      <Stack gap={6}>
        <Cluster>
          <TextLink render={<Link to="/roadmap" activeOptions={{ exact: true }} />}>Back to Roadmap</TextLink>
        </Cluster>
        {roadmap.isPending ? (
          <LoadingState title="Loading this Unit" />
        ) : roadmap.isError ? (
          <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />
        ) : unit ? (
          <UnitDetails unit={unit} />
        ) : (
          <EmptyState title="This Unit isn't on your Roadmap" description="Your Roadmap may have been revised since." />
        )}
      </Stack>
    </Container>
  );
}

function UnitDetails({ unit }: { unit: Unit }) {
  const past = unit.lessons.filter((l) => l.status === "completed");
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
          <Text tone="muted">
            {unit.endsWithRoleplay ? "Ends with a Roleplay after its practice Lessons." : "No Roleplay in this Unit."}
          </Text>
          {unit.status === "active" && <LessonAction unit={unit} />}
        </Stack>
      </Card>
      <Stack gap={4}>
        <Stack gap={1}>
          <Heading level={2}>Lessons</Heading>
          <Text tone="muted">How close each finished Lesson came to the objective.</Text>
        </Stack>
        {past.length ? (
          <CardList>
            {past.map((l) => (
              <Stack key={l.id} gap={2}>
                <TextLink
                  render={
                    l.kind === "roleplay" ? (
                      <Link to="/roleplays/$roleplayId" params={{ roleplayId: l.id }} />
                    ) : (
                      <Link to="/lessons/$lessonId" params={{ lessonId: l.id }} />
                    )
                  }
                >
                  {l.title}
                </TextLink>
                <Meter label="Objective progress" value={l.objectiveProgress ?? 0} />
              </Stack>
            ))}
          </CardList>
        ) : (
          <Text tone="muted">No Lessons finished yet.</Text>
        )}
      </Stack>
    </Stack>
  );
}
