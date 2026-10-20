import { Button, Notice, Screen, Stack, StarterShell } from "@fluently/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import {
  ContextStage,
  MAX_CONTEXT,
  SituationStage,
  stageCopy,
  StatementStage,
} from "../../../components/goals/GoalStages";
import { SignOutControl } from "../../../components/auth/SignOutControl";
import { api } from "../../../lib/api";
import { authClient } from "../../../lib/auth";
import { practiceTime } from "../../../lib/practice-time";

export const Route = createFileRoute("/_signedIn/goals/")({ component: Goals });

function Goals() {
  const router = useRouter();
  const [stage, setStage] = useState(1);
  const [statement, setStatement] = useState("");
  const [situation, setSituation] = useState<string[]>([]);
  const [extra, setExtra] = useState({ context: "", hours: "", minWeeks: "", maxWeeks: "" });
  const [rejected, setRejected] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  // What's saved so far, so trying again after a failure doesn't create a Goal twice.
  const created = useRef<string | undefined>(undefined);
  const confirmed = useRef(false);

  const timing = practiceTime(extra.hours, extra.minWeeks, extra.maxWeeks);
  const goal = statement.trim();
  const goalError = statement.length > 0 && goal.length < 3 ? "Write your Goal in at least 3 characters." : undefined;
  const goalContext = [
    situation.length ? `I want to practise: ${situation.join(", ")}.` : "",
    extra.context.trim(),
    timing.context,
  ]
    .filter(Boolean)
    .join("\n\n");
  const over = goalContext.length > MAX_CONTEXT;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || stage !== 3 || !goal || over || timing.error) return;
    setPending(true);
    setError(undefined);
    setRejected(false);
    try {
      const text = goalContext || undefined;
      let id = created.current;
      if (!id) {
        const response = await api().api.goals.$post({ json: { statement: goal, context: text } });
        if ((response.status as number) === 400) return setRejected(true);
        if (!response.ok) throw new Error();
        id = (await response.json()).id;
        created.current = id;
      }
      // Confirming writes the Learner Brief and the Roadmap waits for the Assessment.
      if (!confirmed.current) {
        const response = await api().api.goals[":id"].confirm.$post({
          param: { id },
          json: { statement: goal, context: text },
        });
        if ((response.status as number) === 400) return setRejected(true);
        if (!response.ok) throw new Error();
        confirmed.current = true;
      }
      await router.navigate({ to: "/assessments/new" });
    } catch {
      setError("We couldn't save your Goal. Try again.");
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
      setError("We couldn't reach Fluently. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const { title, description } = stageCopy[stage - 1]!;
  const stageBody = [
    <StatementStage key={1} statement={statement} error={goalError} disabled={pending} onChange={setStatement} />,
    <SituationStage key={2} situation={situation} disabled={pending} onChange={setSituation} />,
    <ContextStage
      key={3}
      values={extra}
      contextLength={goalContext.length}
      contextError={over || rejected}
      timingError={timing.error}
      disabled={pending}
      onChange={(key, value) => setExtra((current) => ({ ...current, [key]: value }))}
    />,
  ][stage - 1];
  const back = stage > 1 && (
    <Button fullWidth variant="secondary" type="button" disabled={pending} onClick={() => setStage((s) => s - 1)}>
      Back
    </Button>
  );
  const forward =
    stage < 3 ? (
      <Button
        fullWidth
        type="button"
        disabled={!goal || !!goalError}
        onClick={(event) => {
          event.preventDefault();
          setStage((s) => s + 1);
        }}
      >
        Continue
      </Button>
    ) : (
      <Button fullWidth type="submit" disabled={pending || !goal || over || !!timing.error}>
        {pending ? "Saving your Goal…" : "Meet my coach"}
      </Button>
    );

  const signOutLink = <SignOutControl pending={pending} onConfirm={signOut} />;

  return (
    <Screen>
      <StarterShell step={stage} title={title} description={description} action={signOutLink}>
        <form onSubmit={submit}>
          <Stack gap={6}>
            {stageBody}
            {error && <Notice tone="error">{error}</Notice>}
            <Stack gap={3}>
              {forward}
              {back}
            </Stack>
          </Stack>
        </form>
      </StarterShell>
    </Screen>
  );
}
