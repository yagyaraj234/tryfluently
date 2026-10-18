import { Button, ChoiceChips, Container, Heading, Notice, Screen, Stack, Text, TextArea, TextLink } from "@impromptu/ui";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../../../lib/api";
import { authClient } from "../../../lib/auth";

export const Route = createFileRoute("/_signedIn/goals/")({ component: Goals });

type Kind = "job_interview" | "client_communication" | "general_fluency";

const goals: { value: Kind; label: string; hint: string }[] = [
  { value: "job_interview", label: "Job Interview", hint: "Paste your CV or the job description: the role, seniority and company." },
  { value: "client_communication", label: "Client Communication", hint: "Describe your clients and the calls or meetings you have with them." },
  { value: "general_fluency", label: "General Fluency", hint: "Tell us where you use English day to day." },
];

/** The API's limit on Goal Context. */
const MAX_CONTEXT = 20_000;
const tooLong = "Goal Context can be at most 20,000 characters. Trim it to the parts that matter most.";

function Goals() {
  const router = useRouter();
  const [picked, setPicked] = useState<Kind[]>([]);
  const [context, setContext] = useState<Partial<Record<Kind, string>>>({});
  const [rejected, setRejected] = useState<Kind>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  // What's saved so far, so trying again after a failure doesn't create a Goal twice.
  const created = useRef(new Map<Kind, string>());
  const confirmed = useRef(new Set<Kind>());

  const over = picked.filter((kind) => (context[kind]?.length ?? 0) > MAX_CONTEXT);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picked.length || over.length) return;
    setPending(true);
    setError(undefined);
    setRejected(undefined);
    try {
      for (const kind of picked.filter((k) => !confirmed.current.has(k))) {
        const text = context[kind]?.trim() || undefined;
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
    <Screen surface="loud">
      <Container width="prose">
        <Stack gap={8}>
          <Stack gap={3}>
            <Heading level={1}>What are you preparing for?</Heading>
            <Text>Pick one or more Goals. Your Lessons and Roleplays are built around them.</Text>
          </Stack>
          <form onSubmit={submit}>
            <Stack gap={6}>
              <ChoiceChips
                multiple
                label="Goals"
                options={goals}
                value={picked}
                onValueChange={(value) => setPicked(value as Kind[])}
              />
              {goals
                .filter((goal) => picked.includes(goal.value))
                .map((goal) => {
                  const length = context[goal.value]?.length ?? 0;
                  return (
                    <TextArea
                      key={goal.value}
                      label={`${goal.label}: Goal Context (optional)`}
                      placeholder={goal.hint}
                      rows={6}
                      value={context[goal.value] ?? ""}
                      onValueChange={(value) => setContext((c) => ({ ...c, [goal.value]: value }))}
                      description={`${length.toLocaleString("en")} / ${MAX_CONTEXT.toLocaleString("en")} characters`}
                      error={length > MAX_CONTEXT || rejected === goal.value ? tooLong : undefined}
                    />
                  );
                })}
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" fullWidth disabled={pending || !picked.length || over.length > 0}>
                {pending ? "Saving your Goals…" : "Continue"}
              </Button>
            </Stack>
          </form>
          <Stack gap={3} align="start">
            <Text tone="muted">Not sure yet? Take the Assessment first and it will propose Goals for you.</Text>
            <TextLink render={<Link to="/assessments/new" />}>Skip for now</TextLink>
            <TextLink onClick={signOut} disabled={pending}>Sign out</TextLink>
          </Stack>
        </Stack>
      </Container>
    </Screen>
  );
}
