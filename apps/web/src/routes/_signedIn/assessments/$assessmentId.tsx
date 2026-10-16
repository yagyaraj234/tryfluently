import { Container, Heading, Screen } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

// Placeholder: the Written Assessment (#89) and the Voice Assessment (#93) replace it.
export const Route = createFileRoute("/_signedIn/assessments/$assessmentId")({ component: Assessment });

function Assessment() {
  return (
    <Screen surface="quiet">
      <Container>
        <Heading level={1}>Your Assessment</Heading>
      </Container>
    </Screen>
  );
}
