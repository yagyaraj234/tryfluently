import { Container, Heading, Screen } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in")({ component: SignIn });

function SignIn() {
  return (
    <Screen surface="loud">
      <Container>
        <Heading level={1}>Sign in</Heading>
      </Container>
    </Screen>
  );
}
