import { Container, ErrorState, Grid, LoadingState, Stack, Text, UnitCard } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildRoadmap } from "../../../../components/roadmap/BuildRoadmap";
import { roadmapQuery, unitProgress } from "../../../../lib/queries";

export const Route = createFileRoute("/_signedIn/_app/roadmap/")({
  staticData: { title: "Roadmap" },
  loader: ({ context }) => context.queryClient.prefetchQuery(roadmapQuery),
  component: Roadmap,
});

function Roadmap() {
  const roadmap = useQuery(roadmapQuery);
  return (
    <Container width="page">
      <Stack gap={6}>
        <Text tone="muted">Your Units in order. It changes as your Skill Profile does.</Text>
        {roadmap.isPending ? (
          <LoadingState title="Loading your Roadmap" />
        ) : roadmap.isError ? (
          <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />
        ) : roadmap.data.length ? (
          <Grid ordered>
            {roadmap.data.map((unit) => (
              <UnitCard
                key={unit.id}
                title={unit.title}
                objective={unit.objective}
                status={unit.status}
                number={unit.position + 1}
                skill={unit.skills[0]}
                progress={unit.status === "active" ? unitProgress(unit) : undefined}
                render={<Link to="/roadmap/$unitId" params={{ unitId: unit.id }} />}
              />
            ))}
          </Grid>
        ) : (
          <BuildRoadmap />
        )}
      </Stack>
    </Container>
  );
}
