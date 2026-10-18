import {
  Button,
  Card,
  CardList,
  Chip,
  Cluster,
  Container,
  Dialog,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LessonAction } from "../../../../components/roadmap/LessonAction";
import { api } from "../../../../lib/api";
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
            {unit.endsWithRoleplay ? "Ends with a Roleplay once you're close to the objective." : "No Roleplay in this Unit."}
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
              <Meter key={l.id} label={l.title} value={l.objectiveProgress ?? 0} />
            ))}
          </CardList>
        ) : (
          <Text tone="muted">No Lessons finished yet.</Text>
        )}
      </Stack>
      {(unit.status === "active" || unit.status === "planned") && (
        <SkipUnit unit={unit} />
      )}
    </Stack>
  );
}

function SkipUnit({ unit }: { unit: Unit }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const skip = useMutation({
    mutationFn: async () => {
      const response = await api().api.roadmap.units[":id"].skip.$post({ param: { id: unit.id } });
      // 409: already finished. Either way the Roadmap has moved on, so refetch it.
      if (!response.ok && response.status !== 409) throw new Error(`Couldn't skip this Unit (${response.status})`);
      await queryClient.invalidateQueries(roadmapQuery);
    },
    onSuccess: () => navigate({ to: "/roadmap" }),
  });

  return (
    <>
      <Cluster>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Skip this Unit
        </Button>
      </Cluster>
      <Dialog
        open={open}
        // No closing while the Roadmap is being revised.
        onOpenChange={(next) => !skip.isPending && setOpen(next)}
        title={`Skip ${unit.title}?`}
        description={
          skip.isPending
            ? undefined
            : "It will be marked skipped and your Roadmap revised around it. You can't undo this."
        }
      >
        {skip.isPending ? (
          <LoadingState title="Revising your Roadmap" description="Planning your next Units without this one." />
        ) : skip.isError ? (
          <ErrorState title="Couldn't skip this Unit" description="Nothing changed. Try again." onRetry={() => skip.mutate()} />
        ) : (
          <Cluster justify="end">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Keep this Unit
            </Button>
            <Button onClick={() => skip.mutate()}>Skip Unit</Button>
          </Cluster>
        )}
      </Dialog>
    </>
  );
}
