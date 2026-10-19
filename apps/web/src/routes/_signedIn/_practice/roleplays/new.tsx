import { Button, ChoiceChips, EmptyState, Heading, Notice, Stack, Text } from "@impromptu/ui";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../../lib/api";
import { roleplayKinds, tones, type RoleplayKind, type Tone } from "../../../../components/roleplay/roleplay";

/** Roleplay setup: the Goal, the kind (only fixed Goals skip it), the tone, and speaking or typing. */
export const Route = createFileRoute("/_signedIn/_practice/roleplays/new")({
  loader: () => confirmedGoals(),
  component: RoleplaySetup,
});

async function confirmedGoals() {
  const response = await api().api.goals.$get();
  if (!response.ok) throw new Error(`Couldn't load your Goals (${response.status})`);
  return (await response.json()).filter((g) => g.status === "confirmed");
}

const goalNames = {
  job_interview: "Job Interview",
  client_communication: "Client Communication",
  general_fluency: "General Fluency",
};
// A Job Interview is always a Mock Interview and Client Communication a Client Call. Other Goals choose.
const kindFor: Partial<Record<keyof typeof goalNames, RoleplayKind>> = {
  job_interview: "mock_interview",
  client_communication: "client_call",
};
const goalLabel = (g: { kind: keyof typeof goalNames; statement: string | null }) => g.statement ?? goalNames[g.kind];

const options = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

const modes = [
  { value: "voice", label: "Speak" },
  { value: "text", label: "Type" },
];

function RoleplaySetup() {
  const goals = Route.useLoaderData();
  const router = useRouter();
  const [goalId, setGoalId] = useState(goals[0]?.id);
  const [chosenKind, setChosenKind] = useState<RoleplayKind | null>(null);
  const [tone, setTone] = useState<Tone>("standard");
  const [mode, setMode] = useState("voice");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const selected = goals.find((g) => g.id === goalId);
  if (!selected)
    return (
      <EmptyState
        title="Confirm a Goal first"
        description="Roleplays practise situations from your Goals."
        action={<Button render={<Link to="/goals" />}>Set your Goals</Button>}
      />
    );

  const fixedKind = kindFor[selected.kind];
  const kind = fixedKind ?? chosenKind;

  async function start() {
    if (!kind || !selected) return;
    setStarting(true);
    setError(undefined);
    try {
      const response = await api().api.roleplays.$post({
        json: { goalId: selected.id, kind, tone, textMode: mode === "text" },
      });
      if (response.status !== 201) {
        const body = (await response.json()) as { error?: string };
        return setError(body.error ?? "We couldn't start your Roleplay. Try again.");
      }
      const { id } = await response.json();
      await router.navigate({ to: "/roleplays/$roleplayId", params: { roleplayId: id } });
    } catch {
      setError("We couldn't reach Impromptu. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Stack gap={8}>
      <Stack gap={3}>
        <Heading level={1}>Start a Roleplay</Heading>
        <Text>Your coach plays an interviewer or client and stays in character. Your Debrief comes at the end.</Text>
      </Stack>
      {goals.length > 1 ? (
        <ChoiceChips
          label="Goal"
          options={goals.map((g) => ({ value: g.id, label: goalLabel(g) }))}
          value={goalId}
          onValueChange={setGoalId}
        />
      ) : (
        <Text size="label" tone="muted">{`Your Goal: ${goalLabel(selected)}`}</Text>
      )}
      {!fixedKind && (
        <ChoiceChips
          label="Roleplay"
          options={options(roleplayKinds)}
          value={chosenKind}
          onValueChange={(v) => setChosenKind(v as RoleplayKind)}
        />
      )}
      <ChoiceChips label="Tone" options={options(tones)} value={tone} onValueChange={(v) => setTone(v as Tone)} />
      <ChoiceChips label="Speak or type" options={modes} value={mode} onValueChange={setMode} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button fullWidth onClick={() => void start()} disabled={!kind || starting}>
        {starting ? "Starting…" : kind ? `Start the ${roleplayKinds[kind]}` : "Start the Roleplay"}
      </Button>
    </Stack>
  );
}
