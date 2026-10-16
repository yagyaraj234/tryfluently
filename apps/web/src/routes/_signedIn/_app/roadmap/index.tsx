import { Container, ErrorState, Heading, LoadingState, Stack, Text, UnitCard } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildRoadmap } from "../../../../BuildRoadmap";
import { roadmapQuery } from "../../../../queries";

export const Route = createFileRoute("/_signedIn/_app/roadmap/")({
  loader: ({ context }) => context.queryClient.prefetchQuery(roadmapQuery),
  component: Roadmap,
});

function Roadmap() {
  const roadmap = useQuery(roadmapQuery);
  return (
    <Container>
      <Stack gap={6}>
        <Stack gap={2}>
          <Heading level={1}>Roadmap</Heading>
          <Text tone="muted">Your Units in order. It changes as your Skill Profile does.</Text>
        </Stack>
        {roadmap.isPending ? (
          <LoadingState title="Loading your Roadmap" />
        ) : roadmap.isError ? (
          <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />
        ) : roadmap.data.length ? (
          <Stack>
            {roadmap.data.map((unit) => (
              <UnitCard
                key={unit.id}
                title={unit.title}
                objective={unit.objective}
                status={unit.status}
                render={<Link to="/roadmap/$unitId" params={{ unitId: unit.id }} />}
              />
            ))}
          </Stack>
        ) : (
          <BuildRoadmap />
        )}
      </Stack>
    </Container>
  );
}
