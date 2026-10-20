import { Flag } from "@phosphor-icons/react";
import {
  Button,
  Card,
  Cluster,
  EmptyState,
  ErrorState,
  Heading,
  LoadingState,
  Notice,
  Select,
  Stack,
  Text,
  TextArea,
  type CefrLevel,
} from "@fluently/ui";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../lib/api";

export async function proposedGoals() {
  const response = await api().api.goals.$get();
  if (!response.ok) throw new Error("Couldn't load your proposed Goals");
  return (await response.json()).filter((g) => g.status === "proposed");
}

const kinds = {
  job_interview: "Job Interview",
  client_communication: "Client Communication",
  general_fluency: "General Fluency",
};
const skills = ["fluency", "grammar", "vocabulary"] as const;
const options = (["A1", "A2", "B1", "B2", "C1", "C2"] as const).map((value) => ({ value, label: value }));
type TargetLevels = Partial<Record<(typeof skills)[number], CefrLevel>>;

export function GoalReview({ initialGoals }: { initialGoals: Awaited<ReturnType<typeof proposedGoals>> }) {
  const router = useRouter();
  const [goals, setGoals] = useState(initialGoals);
  const [levels, setLevels] = useState<Record<string, TargetLevels>>(() =>
    Object.fromEntries(initialGoals.map((g) => [g.id, g.targetLevels as TargetLevels])),
  );
  const [statements, setStatements] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialGoals.map((g) => [g.id, g.statement ?? kinds[g.kind]])),
  );
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [error, setError] = useState<string>();
  const ready = goals.every((g) => (statements[g.id]?.trim().length ?? 0) >= 3);

  async function build() {
    setBuilding(true);
    setBuildFailed(false);
    try {
      const response = await api().api.roadmap.$post();
      if (response.status === 409) {
        const existing = await api().api.roadmap.$get();
        if (!existing.ok || !(await existing.json()).length) throw new Error();
      } else if (!response.ok) throw new Error();
      await router.navigate({ to: "/roadmap" });
    } catch {
      setBuilding(false);
      setBuildFailed(true);
    }
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      for (const goal of goals) {
        const response = await api().api.goals[":id"].confirm.$post({
          param: { id: goal.id },
          json: { statement: statements[goal.id]?.trim() || kinds[goal.kind], targetLevels: levels[goal.id] },
        });
        // 502 means confirmation succeeded but Roadmap generation needs another attempt.
        if (!response.ok && (response.status as number) !== 502) throw new Error();
        setGoals((current) => current.filter((g) => g.id !== goal.id));
      }
      await build();
    } catch {
      setError("We couldn't confirm every Goal. The ones already confirmed are saved; try again for the rest.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api().api.goals[":id"].$delete({ param: { id } });
      if (!response.ok) throw new Error();
      setGoals((current) => current.filter((g) => g.id !== id));
    } catch {
      setError("We couldn't remove that suggestion. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (building)
    return (
      <LoadingState
        title="Building your Roadmap"
        description="Your coach is planning Units around your Goals and Skill Profile."
      />
    );
  if (buildFailed)
    return (
      <ErrorState
        title="We couldn't build your Roadmap"
        description="Your Goals are saved. Try again."
        onRetry={() => void build()}
        retryLabel="Build my Roadmap"
      />
    );

  return (
    <Stack gap={5}>
      <Heading level={2} size="title">
        Your coach’s suggestions
      </Heading>
      <Text tone="muted">Edit your Goal and Target Levels, then build your Roadmap.</Text>
      {error && <Notice tone="error">{error}</Notice>}
      {goals.map((goal) => (
        <Card key={goal.id}>
          <Stack gap={4}>
            <TextArea
              label="Your Goal"
              rows={2}
              value={statements[goal.id] ?? ""}
              disabled={busy}
              maxLength={300}
              onValueChange={(value) => setStatements((current) => ({ ...current, [goal.id]: value }))}
            />
            {skills
              .filter((skill) => skill in (goal.targetLevels as TargetLevels))
              .map((skill) => (
                <Select
                  key={skill}
                  label={`${skill[0]!.toUpperCase() + skill.slice(1)} Target Level`}
                  options={options}
                  value={levels[goal.id]?.[skill] ?? ""}
                  disabled={busy}
                  onValueChange={(value) =>
                    setLevels((current) => ({
                      ...current,
                      [goal.id]: { ...current[goal.id], [skill]: value as CefrLevel },
                    }))
                  }
                />
              ))}
            <Cluster>
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void remove(goal.id)}>
                Remove
              </Button>
            </Cluster>
          </Stack>
        </Card>
      ))}
      {!goals.length && (
        <EmptyState
          icon={Flag}
          title="No Goals to confirm"
          description="Your confirmed Goals will be used for your Roadmap."
        />
      )}
      <Button fullWidth disabled={busy || !ready} onClick={() => void confirm()}>
        {busy ? "Saving your Goals…" : "Build my Roadmap"}
      </Button>
    </Stack>
  );
}
