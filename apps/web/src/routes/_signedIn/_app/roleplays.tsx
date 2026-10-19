import { Button, Card, Container, EmptyState, ErrorState, Heading, LoadingState, Stack, Text } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { roleplayKinds, type RoleplayKind } from "../../../components/roleplay/roleplay";
import { roleplaysQuery } from "../../../lib/queries";

export const Route = createFileRoute("/_signedIn/_app/roleplays")({
  staticData: { title: "Roleplays" },
  loader: ({ context }) => context.queryClient.prefetchQuery(roleplaysQuery),
  component: Roleplays,
});

function Roleplays() {
  const sessions = useQuery(roleplaysQuery);
  const { learner } = Route.useRouteContext();
  return (
    <Container>
      <Stack gap={6}>
        <Stack gap={3} align="start">
          <Heading level={2}>Your conversations</Heading>
          <Text tone="muted">Revisit your sessions and the feedback from each conversation.</Text>
          <Button render={<Link to="/roleplays/new" />}>Start Roleplay</Button>
        </Stack>
        {sessions.isPending ? (
          <LoadingState title="Loading Roleplays" />
        ) : sessions.isError ? (
          <ErrorState description="Your Roleplays couldn't be loaded." onRetry={() => sessions.refetch()} />
        ) : !sessions.data.length ? (
          <EmptyState title="No Roleplays yet" description="Start a conversation to practise your English." />
        ) : (
          sessions.data.map((session) => (
            <Card key={session.id}>
              <Stack gap={3} align="start">
                <Heading level={2} size="title">
                  {session.title}
                </Heading>
                {session.roleplayScenario && <Text tone="muted">{session.roleplayScenario}</Text>}
                <Text tone="muted">
                  {session.startedAt
                    ? new Date(session.startedAt).toLocaleDateString("en-GB", {
                        dateStyle: "medium",
                        timeZone: learner.timezone,
                      })
                    : "Not started"}{" "}
                  · {roleplayKinds[session.roleplayKind as RoleplayKind] ?? "Roleplay"} · {session.tone} ·{" "}
                  {session.textMode ? "Text" : "Voice"} ·{" "}
                  {session.status === "completed"
                    ? "Completed"
                    : session.status === "abandoned"
                      ? "Abandoned"
                      : session.startedAt
                        ? "In progress"
                        : "Ready"}
                </Text>
                {session.status === "abandoned" && <Text tone="muted">No feedback available for this session.</Text>}
                <Button
                  variant="secondary"
                  render={<Link to="/roleplays/$roleplayId" params={{ roleplayId: session.id }} />}
                >
                  {session.status === "completed"
                    ? "View feedback"
                    : session.status === "in_progress"
                      ? session.startedAt
                        ? "Resume"
                        : "Start"
                      : "View session"}
                </Button>
              </Stack>
            </Card>
          ))
        )}
      </Stack>
    </Container>
  );
}
