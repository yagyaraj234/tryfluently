import { Flag } from "@phosphor-icons/react";
import { Button, ChoiceChips, EmptyState, Heading, Notice, Stack, Text, TextArea } from "@impromptu/ui";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { api } from "../../../../lib/api";
import {
  roleplayKinds,
  roleplayOptions,
  tones,
  type RoleplayKind,
  type Tone,
} from "../../../../components/roleplay/roleplay";

/** Roleplay setup: the Goal, the situation, the tone, and speaking or typing. */
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
  const [scenario, setScenario] = useState("");
  const [tone, setTone] = useState<Tone>("standard");
  const [mode, setMode] = useState("voice");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string>();

  const selected = goals.find((g) => g.id === goalId);
  if (!selected)
    return (
      <EmptyState
        icon={Flag}
        title="Confirm a Goal first"
        description="Roleplays practise situations from your Goals."
        action={<Button render={<Link to="/goals" />}>Set your Goals</Button>}
      />
    );

  const scenarioText = scenario.trim();
  const scenarioError =
    scenario.length > 0 && scenarioText.length < 3 ? "Describe the situation in at least 3 characters." : undefined;
  const defaultKind = kindFor[selected.kind];
  const pickedKind = chosenKind ?? defaultKind ?? null;
  const kind: RoleplayKind | null = scenarioText ? "custom" : pickedKind;

  async function start() {
    if (!kind || !selected || scenarioError) return;
    setStarting(true);
    setError(undefined);
    try {
      const response = await api().api.roleplays.$post({
        json: { goalId: selected.id, kind, scenario: scenarioText || undefined, tone, textMode: mode === "text" },
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

  const goalPicker =
    goals.length > 1 ? (
      <ChoiceChips
        label="Goal"
        options={goals.map((g) => ({ value: g.id, label: goalLabel(g) }))}
        value={goalId}
        onValueChange={(value) => {
          setGoalId(value);
          setChosenKind(null);
        }}
      />
    ) : (
      <Text size="label" tone="muted">{`Your Goal: ${goalLabel(selected)}`}</Text>
    );

  let startLabel = "Start the Roleplay";
  if (starting) startLabel = "Starting…";
  else if (kind === "custom") startLabel = "Start a Custom Roleplay";
  else if (kind) startLabel = `Start the ${roleplayKinds[kind]}`;

  return (
    <Stack gap={8}>
      <Stack gap={3}>
        <Heading level={1}>Start a Roleplay</Heading>
        <Text>
          Your coach plays the other person and stays in character. Choose a situation or describe your own. Your
          Debrief comes at the end.
        </Text>
      </Stack>
      {goalPicker}
      <ChoiceChips
        label="Situation"
        options={roleplayOptions}
        value={scenarioText ? null : pickedKind}
        onValueChange={(value) => {
          setChosenKind(value as RoleplayKind);
          setScenario("");
        }}
      />
      <TextArea
        label="Or describe your own situation (optional)"
        rows={3}
        maxLength={500}
        value={scenario}
        onValueChange={setScenario}
        description="Describe what is happening and who your coach should play."
        placeholder="For example, I need to ask my landlord to fix the heating and they keep delaying."
        error={scenarioError}
      />
      <ChoiceChips
        layout="segmented"
        label="Tone"
        options={options(tones)}
        value={tone}
        onValueChange={(v) => setTone(v as Tone)}
      />
      <ChoiceChips layout="segmented" label="Speak or type" options={modes} value={mode} onValueChange={setMode} />
      {error && <Notice tone="error">{error}</Notice>}
      <Button fullWidth onClick={() => void start()} disabled={!kind || starting || !!scenarioError}>
        {startLabel}
      </Button>
    </Stack>
  );
}
