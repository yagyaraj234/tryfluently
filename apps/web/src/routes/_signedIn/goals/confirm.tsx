import { Container, Heading, Screen, Stack } from "@impromptu/ui";
import { createFileRoute } from "@tanstack/react-router";
import { GoalReview, proposedGoals } from "../../../components/assessment/GoalReview";

export const Route = createFileRoute("/_signedIn/goals/confirm")({ loader: proposedGoals, component: ConfirmGoals });

function ConfirmGoals() {
  return (
    <Screen>
      <Container width="prose">
        <Stack gap={8}>
          <Heading level={1}>Confirm your Goals</Heading>
          <GoalReview initialGoals={Route.useLoaderData()} />
        </Stack>
      </Container>
    </Screen>
  );
}
