import { Container, EmptyState, Heading, Stack } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/_app/progress")({ component: Progress });

// A placeholder until #96 builds this screen.
function Progress() {
  return (
    <Container>
      <Stack>
        <Heading level={1}>Progress</Heading>
        <EmptyState title="Coming soon" description="Your Skill Profile and Focus Items will show here." />
      </Stack>
    </Container>
  );
}
