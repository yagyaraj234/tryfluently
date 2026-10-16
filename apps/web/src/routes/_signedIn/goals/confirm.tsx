import { Button, Card, Cluster, Container, EmptyState, ErrorState, Heading, LoadingState, Notice, Screen, Select, Stack, Text, cefrLevels, type CefrLevel } from "@impromptu/ui";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../api";

/** Confirming the Goals and Target Levels the Assessment proposed. Once none are left, the Roadmap is built. */
export const Route = createFileRoute("/_signedIn/goals/confirm")({ loader: () => proposedGoals(), component: ConfirmGoals });

async function proposedGoals() {
  const response = await api().api.goals.$get();
  if (!response.ok) throw new Error(`Couldn't load your Goals (${response.status})`);
  return (await response.json()).filter((g) => g.status === "proposed");
}

const kinds = { job_interview: "Job Interview", client_communication: "Client Communication", general_fluency: "General Fluency" };
const skills = [
  { skill: "fluency", label: "Fluency" },
  { skill: "grammar", label: "Grammar" },
  { skill: "vocabulary", label: "Vocabulary" },
] as const;
const levelOptions = cefrLevels.map((l) => ({ value: l, label: l }));

type TargetLevels = Partial<Record<(typeof skills)[number]["skill"], CefrLevel>>;

function ConfirmGoals() {
  const router = useRouter();
  const [goals, setGoals] = useState<Awaited<ReturnType<typeof proposedGoals>>>(Route.useLoaderData());
  const [levels, setLevels] = useState<Record<string, TargetLevels>>(() =>
    Object.fromEntries(goals.map((g) => [g.id, g.targetLevels as TargetLevels])),
  );
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirmed, setConfirmed] = useState<string>();
  const [roadmap, setRoadmap] = useState<"building" | "failed">();

  // POST /api/roadmap builds it if it's missing; "already exists" (409) is just as good.
  async function buildRoadmap() {
    setRoadmap("building");
    try {
      const response = await api().api.roadmap.$post();
      if ((response.status as number) >= 500) return setRoadmap("failed");
      await router.navigate({ to: "/" });
    } catch {
      setRoadmap("failed");
    }
  }

  async function settle(id: string, action: "confirm" | "remove") {
    const last = goals.length === 1;
    setBusy(id);
    setError(undefined);
    setConfirmed(undefined);
    if (last) setRoadmap("building");
    try {
      const param = { param: { id } };
      const response =
        action === "confirm"
          ? await api().api.goals[":id"].confirm.$post({ ...param, json: { targetLevels: levels[id] } })
          : await api().api.goals[":id"].$delete(param);
      // A 502 means the Goal was confirmed but the Roadmap couldn't be built.
      const roadmapFailed = (response.status as number) === 502;
      if (!response.ok && !roadmapFailed) throw new Error();
      const goal = goals.find((g) => g.id === id)!;
      setConfirmed(`${kinds[goal.kind]} ${action === "confirm" ? "confirmed" : "removed"}.`);
      setGoals((gs) => gs.filter((g) => g.id !== id));
      if (!last) return;
      // Confirming the last Goal builds the Roadmap as it confirms; removing it may have, so make sure.
      if (action === "confirm" && !roadmapFailed) return await router.navigate({ to: "/" });
      if (roadmapFailed) return setRoadmap("failed");
      await buildRoadmap();
    } catch {
      setRoadmap(undefined);
      setError("We couldn't save that. Try again.");
    } finally {
      setBusy(undefined);
    }
  }

  if (roadmap === "failed")
    return (
      <Screen surface="loud">
        <ErrorState
          title="We couldn't build your Roadmap"
          description="Your Goals are saved. Try building the Roadmap again."
          onRetry={() => void buildRoadmap()}
          retryLabel="Build my Roadmap"
        />
      </Screen>
    );
  if (roadmap === "building")
    return (
      <Screen surface="loud">
        <LoadingState title="Building your Roadmap…" description="Your coach is planning your Units around your Goals. This takes up to a minute." />
      </Screen>
    );
  if (!goals.length)
    return (
      <Screen surface="loud">
        <EmptyState title="No Goals to confirm" action={<Button render={<Link to="/" />}>Go to Home</Button>} />
      </Screen>
    );

  return (
    <Screen surface="loud">
      <Container width="prose">
        <Stack gap={8}>
          <Stack gap={3}>
            <Heading level={1}>Confirm your Goals</Heading>
            <Text>
              From your Assessment, your coach suggests these Goals and the CEFR Level to aim for on each skill. Change the Target
              Levels if you like, then confirm each Goal or remove it.
            </Text>
          </Stack>
          {error && <Notice tone="error">{error}</Notice>}
          {confirmed && !error && <Notice tone="info">{confirmed}</Notice>}
          {goals.map((goal) => (
            <Card key={goal.id}>
              <Stack gap={5}>
                <Heading level={2} size="title">
                  {kinds[goal.kind]}
                </Heading>
                {skills.filter(({ skill }) => skill in (goal.targetLevels as TargetLevels)).map(({ skill, label }) => (
                  <Select
                    key={skill}
                    label={`${label} Target Level`}
                    options={levelOptions}
                    value={levels[goal.id]?.[skill] ?? ""}
                    onValueChange={(value) => setLevels((l) => ({ ...l, [goal.id]: { ...l[goal.id], [skill]: value as CefrLevel } }))}
                    disabled={busy !== undefined}
                  />
                ))}
                <Cluster gap={3}>
                  <Button onClick={() => void settle(goal.id, "confirm")} disabled={busy !== undefined}>
                    {busy === goal.id ? "Saving…" : "Confirm"}
                  </Button>
                  <Button variant="secondary" onClick={() => void settle(goal.id, "remove")} disabled={busy !== undefined}>
                    Remove
                  </Button>
                </Cluster>
              </Stack>
            </Card>
          ))}
        </Stack>
      </Container>
    </Screen>
  );
}
