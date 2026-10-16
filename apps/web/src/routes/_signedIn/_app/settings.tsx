import { Container, EmptyState, Heading, Stack } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/_app/settings")({ component: Settings });

// A placeholder until #96 builds this screen.
function Settings() {
  return (
    <Container>
      <Stack>
        <Heading level={1}>Settings</Heading>
        <EmptyState title="Coming soon" description="Theme, timezone and your account will live here." />
      </Stack>
    </Container>
  );
}
