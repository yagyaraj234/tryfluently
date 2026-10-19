import {
  Button,
  ChoiceChips,
  Cluster,
  Grid,
  Notice,
  Screen,
  Stack,
  StarterShell,
  Text,
  TextArea,
  TextField,
  TextLink,
} from "@impromptu/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { api } from "../../../lib/api";
import { authClient } from "../../../lib/auth";
import { practiceTime } from "../../../lib/practice-time";

export const Route = createFileRoute("/_signedIn/goals/")({ component: Goals });

const examples = [
  { value: "Get ready for a job interview in English.", label: "Job Interview" },
  { value: "Lead client calls and explain ideas clearly.", label: "Client Communication" },
  { value: "Speak more easily in everyday conversations.", label: "General Fluency" },
];

const situations = [
  "Everyday conversations",
  "Work meetings",
  "Job interviews",
  "Client calls",
  "Presentations",
  "Travel",
  "Study",
  "Writing emails",
  "Phone calls",
  "Small talk",
].map((value) => ({ value, label: value }));

/** The API's limits on the Goal statement and Goal Context. */
const MAX_GOAL = 300;
const MAX_CONTEXT = 20_000;
const tooLong = "Goal Context can be at most 20,000 characters. Trim it to the parts that matter most.";

function Goals() {
  const router = useRouter();
  const [stage, setStage] = useState(1);
  const [statement, setStatement] = useState("");
  const [situation, setSituation] = useState<string[]>([]);
  const [context, setContext] = useState("");
  const [hours, setHours] = useState("");
  const [minWeeks, setMinWeeks] = useState("");
  const [maxWeeks, setMaxWeeks] = useState("");
  const [rejected, setRejected] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  // What's saved so far, so trying again after a failure doesn't create a Goal twice.
  const created = useRef<string | undefined>(undefined);
  const confirmed = useRef(false);

  const timing = practiceTime(hours, minWeeks, maxWeeks);
  const goal = statement.trim();
  const goalError = statement.length > 0 && goal.length < 3 ? "Write your Goal in at least 3 characters." : undefined;
  const goalContext = [
    situation.length ? `I want to practise: ${situation.join(", ")}.` : "",
    context.trim(),
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
      setError("We couldn't reach Impromptu. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <StarterShell
        step={stage}
        title={
          stage === 1
            ? "What do you want to achieve?"
            : stage === 2
              ? "Which situations should we practise?"
              : "Add your own context"
        }
        description={
          stage === 1
            ? "Describe your end goal in your own words. Your coach will build Lessons around it."
            : stage === 2
              ? "Pick any that fit your Goal. Your coach will use them as examples."
              : "Tell your coach about your work or a situation you have coming up. These details are optional."
        }
      >
        <form onSubmit={submit}>
          <Stack gap={6}>
            {stage === 1 && (
              <>
                <TextArea
                  label="Your Goal"
                  rows={4}
                  maxLength={MAX_GOAL}
                  value={statement}
                  disabled={pending}
                  description="What do you want to achieve after this course? What is your end goal?"
                  placeholder="For example, I want to lead client calls without freezing when they ask questions."
                  onValueChange={setStatement}
                  error={goalError}
                />
                <ChoiceChips
                  label="Or start with an example"
                  options={examples}
                  disabled={pending}
                  value={examples.some((example) => example.value === statement) ? statement : null}
                  onValueChange={setStatement}
                />
              </>
            )}
            {stage === 2 && (
              <ChoiceChips
                multiple
                label="Situations (optional)"
                options={situations}
                value={situation}
                disabled={pending}
                onValueChange={setSituation}
              />
            )}
            {stage === 3 && (
              <>
                <TextArea
                  label="Goal Context (optional)"
                  placeholder="Your work, the situations you have coming up, or what you find hard."
                  rows={4}
                  value={context}
                  disabled={pending}
                  onValueChange={setContext}
                  description={`${goalContext.length.toLocaleString("en")} / ${MAX_CONTEXT.toLocaleString("en")} characters including your selections`}
                  error={over || rejected ? tooLong : undefined}
                />
                <TextField
                  type="number"
                  label="How much time can you spend practising each week? (optional)"
                  description="Hours per week. For example, 1.5 means 1 hour 30 minutes."
                  min={0.25}
                  max={168}
                  step={0.25}
                  value={hours}
                  disabled={pending}
                  onValueChange={setHours}
                />
                <Stack gap={3}>
                  <Text>When would you like to reach your Goal? (optional)</Text>
                  <Text size="caption" tone="muted">
                    Choose a range in weeks. Your coach uses it to set the pace. It is not a completion guarantee.
                  </Text>
                  <Grid>
                    <TextField
                      type="number"
                      label="Minimum weeks"
                      min={1}
                      step={1}
                      required={!!maxWeeks}
                      value={minWeeks}
                      disabled={pending}
                      onValueChange={setMinWeeks}
                    />
                    <TextField
                      type="number"
                      label="Maximum weeks"
                      min={Number(minWeeks) || 1}
                      step={1}
                      required={!!minWeeks}
                      value={maxWeeks}
                      disabled={pending}
                      onValueChange={setMaxWeeks}
                    />
                  </Grid>
                </Stack>
                {timing.error && <Notice tone="error">{timing.error}</Notice>}
                <Text size="caption" tone="muted">
                  Next, meet your coach. You can talk or type during your Assessment.
                </Text>
              </>
            )}
            {error && <Notice tone="error">{error}</Notice>}
            <Cluster>
              {stage > 1 && (
                <Button variant="secondary" type="button" disabled={pending} onClick={() => setStage((s) => s - 1)}>
                  Back
                </Button>
              )}
              {stage < 3 ? (
                <Button
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
                <Button type="submit" disabled={pending || !goal || over || !!timing.error}>
                  {pending ? "Saving your Goal…" : "Meet my coach"}
                </Button>
              )}
            </Cluster>
          </Stack>
        </form>
        <TextLink onClick={signOut} disabled={pending}>
          Sign out
        </TextLink>
      </StarterShell>
    </Screen>
  );
}
