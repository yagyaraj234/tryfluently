import { Container, Heading, Screen } from "@impromptu/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { api } from "../../api";

/** Where onboarding continues: no Goals and no Assessment → set Goals, proposed Goals → confirm them, otherwise Home. */
function onboardingRoute(goals: { status: string }[], assessments: { status: string }[]) {
  if (goals.some((g) => g.status === "proposed")) return "/goals/confirm" as const;
  if (!goals.length && !assessments.some((a) => a.status !== "discarded")) return "/goals" as const;
}

export const Route = createFileRoute("/_signedIn/")({
  beforeLoad: async () => {
    const [goals, assessments] = await Promise.all([
      api().api.goals.$get().then((r) => r.json()),
      api().api.assessments.$get().then((r) => r.json()),
    ]);
    const to = onboardingRoute(goals, assessments);
    if (to) throw redirect({ to });
  },
  component: Home,
});

function Home() {
  return (
    <Screen surface="loud">
      <Container>
        <Heading level={1}>Home</Heading>
      </Container>
    </Screen>
  );
}
