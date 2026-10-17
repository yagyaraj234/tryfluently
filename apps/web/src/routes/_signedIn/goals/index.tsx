import { Container, Heading, Screen } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/goals/")({ component: Goals });

function Goals() {
  return (
    <Screen surface="loud">
      <Container>
        <Heading level={1}>Set your Goals</Heading>
      </Container>
    </Screen>
  );
}
