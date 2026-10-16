import { Container, EmptyState, Heading, Stack } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/_app/roadmap")({ component: Roadmap });

// A placeholder until #90 builds this screen.
function Roadmap() {
  return (
    <Container>
      <Stack>
        <Heading level={1}>Roadmap</Heading>
        <EmptyState title="Coming soon" description="Your Roadmap of Units will show here." />
      </Stack>
    </Container>
  );
}
