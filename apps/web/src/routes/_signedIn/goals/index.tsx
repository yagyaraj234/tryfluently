import { Button, ChoiceChips, Cluster, Notice, Screen, Stack, StarterShell, Text, TextArea, TextField, TextLink } from "@impromptu/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../../../lib/api";
import { authClient } from "../../../lib/auth";

export const Route = createFileRoute("/_signedIn/goals/")({ component: Goals });

type Kind = "job_interview" | "client_communication" | "general_fluency";

const goals: { value: Kind; label: string; hint: string; description: string }[] = [
  { value: "job_interview", label: "Job Interview", description: "Introduce yourself, share your experience, and answer with confidence.", hint: "Paste your CV or the job description: the role, seniority and company." },
  { value: "client_communication", label: "Client Communication", description: "Clearer calls, stronger explanations, and better working relationships.", hint: "Describe your clients and the calls or meetings you have with them." },
  { value: "general_fluency", label: "General Fluency", description: "Find your words and feel more at ease in everyday conversations.", hint: "Tell us where you use English day to day." },
];

const situations: Record<Kind, string[]> = {
  job_interview: ["Introducing myself", "Explaining my experience", "Answering tricky questions"],
  client_communication: ["Leading a meeting", "Explaining an idea", "Handling a difficult conversation"],
  general_fluency: ["Everyday conversations", "Speaking at work", "Meeting new people"],
};

/** The API's limit on Goal Context. */
const MAX_CONTEXT = 20_000;
const tooLong = "Goal Context can be at most 20,000 characters. Trim it to the parts that matter most.";

function Goals() {
  const router = useRouter();
  const [stage, setStage] = useState(1);
  const [situation, setSituation] = useState<Partial<Record<Kind, string[]>>>({});
  const [date, setDate] = useState("");
  const [picked, setPicked] = useState<Kind[]>([]);
  const [context, setContext] = useState<Partial<Record<Kind, string>>>({});
  const [rejected, setRejected] = useState<Kind>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  // What's saved so far, so trying again after a failure doesn't create a Goal twice.
  const created = useRef(new Map<Kind, string>());
  const confirmed = useRef(new Set<Kind>());

  const goalContext = (kind: Kind) => [
    situation[kind]?.length ? `I want to practise: ${situation[kind]!.join(", ")}.` : "",
    context[kind]?.trim(),
    date ? `Something I am preparing for is on ${date}.` : "",
  ].filter(Boolean).join("\n\n");
  const over = picked.filter((kind) => goalContext(kind).length > MAX_CONTEXT);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || stage !== 3 || !picked.length || over.length) return;
    setPending(true);
    setError(undefined);
    setRejected(undefined);
    try {
      for (const kind of picked.filter((k) => !confirmed.current.has(k))) {
        const text = goalContext(kind) || undefined;
        let id = created.current.get(kind);
        if (!id) {
          const response = await api().api.goals.$post({ json: { kind, context: text } });
          if ((response.status as number) === 400) return setRejected(kind);
          if (!response.ok) throw new Error();
          id = (await response.json()).id;
          created.current.set(kind, id);
        }
        // Confirming writes the Learner Brief (sending the Goal Context again in case it was edited after a failure).
        // The Roadmap waits for the Assessment.
        const response = await api().api.goals[":id"].confirm.$post({ param: { id }, json: text ? { context: text } : {} });
        if ((response.status as number) === 400) return setRejected(kind);
        if (!response.ok) throw new Error();
        confirmed.current.add(kind);
      }
      await router.navigate({ to: "/assessments/new" });
    } catch {
      setError("We couldn't save your Goals. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    setError(undefined);
    try {
      const { error } = await authClient.signOut();
      if (error) return setError("We couldn't sign you out. Try again.");
      await router.navigate({ to: "/sign-in" });
    } catch {
      setError("We couldn't reach Impromptu. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <StarterShell step={stage}
        title={stage === 1 ? "What brings you here?" : stage === 2 ? "Where would confidence help?" : "Make this path yours"}
        description={stage === 1 ? "Choose the Goals that matter to you. We’ll shape your practice around them." : stage === 2 ? "Pick situations you recognise, or add your own context on the next screen." : "Tell your coach about anything specific. These details are optional."}>
        <form onSubmit={submit}>
          <Stack gap={6}>
            {stage === 1 && <ChoiceChips multiple layout="cards" label="Your Goals" options={goals} value={picked} disabled={pending}
              onValueChange={(value) => setPicked(value as Kind[])} />}
            {stage === 2 && goals.filter((g) => picked.includes(g.value)).map((goal) => (
              <ChoiceChips key={goal.value} multiple label={goal.label} disabled={pending}
                options={situations[goal.value].map((value) => ({ value, label: value }))}
                value={situation[goal.value] ?? []}
                onValueChange={(value) => setSituation((s) => ({ ...s, [goal.value]: value }))} />
            ))}
            {stage === 3 && <>
              {goals.filter((g) => picked.includes(g.value)).map((goal) => (
                <TextArea key={goal.value} label={`${goal.label}: Goal Context (optional)`} placeholder={goal.hint} rows={4}
                  value={context[goal.value] ?? ""} disabled={pending}
                  onValueChange={(value) => setContext((c) => ({ ...c, [goal.value]: value }))}
                  description={`${goalContext(goal.value).length.toLocaleString("en")} / ${MAX_CONTEXT.toLocaleString("en")} characters including your selections`}
                  error={over.includes(goal.value) || rejected === goal.value ? tooLong : undefined} />
              ))}
              <TextField type="date" label="Is there a date you’re preparing for? (optional)" value={date} disabled={pending} onValueChange={setDate} />
              <Text size="caption" tone="muted">Next, meet your coach. You can talk or type during your Assessment.</Text>
            </>}
            {error && <Notice tone="error">{error}</Notice>}
            <Cluster>
              {stage > 1 && <Button variant="secondary" type="button" disabled={pending} onClick={() => setStage((s) => s - 1)}>Back</Button>}
              {stage < 3 ? <Button type="button" disabled={!picked.length} onClick={(event) => { event.preventDefault(); setStage((s) => s + 1); }}>Continue</Button>
                : <Button type="submit" disabled={pending || !picked.length || over.length > 0}>{pending ? "Saving your Goals…" : "Meet my coach"}</Button>}
            </Cluster>
          </Stack>
        </form>
        <TextLink onClick={signOut} disabled={pending}>Sign out</TextLink>
      </StarterShell>
    </Screen>
  );
}
