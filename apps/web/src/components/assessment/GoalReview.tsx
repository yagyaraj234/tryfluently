import { Button, Card, Cluster, EmptyState, ErrorState, Heading, LoadingState, Notice, Select, Stack, Text, type CefrLevel } from "@impromptu/ui";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../lib/api";

export async function proposedGoals() {
  const response = await api().api.goals.$get();
  if (!response.ok) throw new Error("Couldn't load your proposed Goals");
  return (await response.json()).filter((g) => g.status === "proposed");
}

const kinds = { job_interview: "Job Interview", client_communication: "Client Communication", general_fluency: "General Fluency" };
const skills = ["fluency", "grammar", "vocabulary"] as const;
const options = (["A1", "A2", "B1", "B2", "C1", "C2"] as const).map((value) => ({ value, label: value }));
type TargetLevels = Partial<Record<(typeof skills)[number], CefrLevel>>;

/** Review suggestions once, beside the Report or on a direct return to confirmation. */
export function GoalReview({ initialGoals }: { initialGoals: Awaited<ReturnType<typeof proposedGoals>> }) {
  const router = useRouter();
  const [goals, setGoals] = useState(initialGoals);
  const [levels, setLevels] = useState<Record<string, TargetLevels>>(() => Object.fromEntries(initialGoals.map((g) => [g.id, g.targetLevels as TargetLevels])));
  const [chosenKinds, setChosenKinds] = useState(() => Object.fromEntries(initialGoals.map((g) => [g.id, g.kind])));
  const [busy, setBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildFailed, setBuildFailed] = useState(false);
  const [error, setError] = useState<string>();

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
        const response = await api().api.goals[":id"].confirm.$post({ param: { id: goal.id }, json: { kind: chosenKinds[goal.id], targetLevels: levels[goal.id] } });
        // 502 means confirmation succeeded but Roadmap generation needs another attempt.
        if (!response.ok && (response.status as number) !== 502) throw new Error();
        setGoals((current) => current.filter((g) => g.id !== goal.id));
      }
      await build();
    } catch {
      setError("We couldn't confirm every Goal. The ones already confirmed are saved; try again for the rest.");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api().api.goals[":id"].$delete({ param: { id } });
      if (!response.ok) throw new Error();
      setGoals((current) => current.filter((g) => g.id !== id));
    } catch { setError("We couldn't remove that suggestion. Try again."); }
    finally { setBusy(false); }
  }

  if (building) return <LoadingState title="Building your Roadmap" description="Your coach is planning Units around your Goals and Skill Profile." />;
  if (buildFailed) return <ErrorState title="We couldn't build your Roadmap" description="Your Goals are saved. Try again." onRetry={() => void build()} retryLabel="Build my Roadmap" />;

  return <Stack gap={5}>
    <Heading level={2} size="title">Your path from here</Heading>
    <Text tone="muted">Review your coach’s suggestions. You can adjust the Goals and Target Levels before building your Roadmap.</Text>
    {error && <Notice tone="error">{error}</Notice>}
    {goals.map((goal) => <Card key={goal.id}><Stack gap={4}>
      <Heading level={3}>{kinds[chosenKinds[goal.id] ?? goal.kind]}</Heading>
      <Select label="Goal kind" options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} value={chosenKinds[goal.id] ?? goal.kind} disabled={busy}
        onValueChange={(value) => setChosenKinds((current) => ({ ...current, [goal.id]: value as keyof typeof kinds }))} />
      {skills.filter((skill) => skill in (goal.targetLevels as TargetLevels)).map((skill) => <Select key={skill} label={`${skill[0]!.toUpperCase() + skill.slice(1)} Target Level`} options={options} value={levels[goal.id]?.[skill] ?? ""} disabled={busy}
        onValueChange={(value) => setLevels((current) => ({ ...current, [goal.id]: { ...current[goal.id], [skill]: value as CefrLevel } }))} />)}
      <Cluster><Button variant="secondary" size="sm" disabled={busy} onClick={() => void remove(goal.id)}>Remove</Button></Cluster>
    </Stack></Card>)}
    {!goals.length && <EmptyState title="No Goals to confirm" description="Your confirmed Goals will be used for your Roadmap." />}
    <Button fullWidth disabled={busy} onClick={() => void confirm()}>{busy ? "Saving your Goals…" : "Build my Roadmap"}</Button>
  </Stack>;
}
