import { Container, Heading, Screen } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_signedIn/goals/confirm")({ component: ConfirmGoals });

function ConfirmGoals() {
  return (
    <Screen surface="loud">
      <Container>
        <Heading level={1}>Confirm your Goals</Heading>
      </Container>
    </Screen>
  );
}
