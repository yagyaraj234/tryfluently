import { Chats } from "@phosphor-icons/react";
import { Button, Cluster, Grid, EmptyState, ErrorState, Heading, LoadingState, Stack, Text } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleplayCard } from "../../../components/roleplay-history/RoleplayCard";
import { roleplaysQuery } from "../../../lib/queries";

export const Route = createFileRoute("/_signedIn/_app/roleplays")({
  staticData: { title: "Roleplays" },
  loader: ({ context }) => context.queryClient.prefetchQuery(roleplaysQuery),
  component: Roleplays,
});

function Roleplays() {
  const sessions = useQuery(roleplaysQuery);
  const { learner } = Route.useRouteContext();

  let list;
  if (sessions.isPending) list = <LoadingState title="Loading Roleplays" />;
  else if (sessions.isError)
    list = <ErrorState description="Your Roleplays couldn't be loaded." onRetry={() => sessions.refetch()} />;
  else if (!sessions.data.length)
    list = (
      <EmptyState icon={Chats} title="No Roleplays yet" description="Start a conversation to practise your English." />
    );
  else
    list = (
      <Grid>
        {sessions.data.map((session) => (
          <RoleplayCard key={session.id} session={session} timezone={learner.timezone} />
        ))}
      </Grid>
    );

  return (
    <Stack gap={6}>
      <Cluster justify="between" gap={4}>
        <Stack gap={2}>
          <Heading level={2} size="title">
            Your conversations
          </Heading>
          <Text tone="muted">Revisit your sessions and the feedback from each conversation.</Text>
        </Stack>
        <Button render={<Link to="/roleplays/new" />}>Start Roleplay</Button>
      </Cluster>
      {list}
    </Stack>
  );
}
