import { ChoiceChips, Grid, Notice, Stack, Text, TextArea, TextField } from "@fluently/ui";

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

export const MAX_GOAL = 300;
export const MAX_CONTEXT = 20_000;
const tooLong = "Goal Context can be at most 20,000 characters. Trim it to the parts that matter most.";

export const stageCopy = [
  {
    title: "What do you want to achieve?",
    description: "Describe your end goal in your own words. Your coach will build Lessons around it.",
  },
  {
    title: "Which situations should we practise?",
    description: "Pick any that fit your Goal. Your coach will use them as examples.",
  },
  {
    title: "Add your own context",
    description: "Tell your coach about your work or a situation you have coming up. These details are optional.",
  },
];

export function StatementStage({
  statement,
  error,
  disabled,
  onChange,
}: {
  statement: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <>
      <TextArea
        label="Your Goal"
        rows={4}
        maxLength={MAX_GOAL}
        value={statement}
        disabled={disabled}
        description="What do you want to achieve after this course? What is your end goal?"
        placeholder="For example, I want to lead client calls without freezing when they ask questions."
        onValueChange={onChange}
        error={error}
      />
      <ChoiceChips
        label="Or start with an example"
        options={examples}
        disabled={disabled}
        value={examples.some((example) => example.value === statement) ? statement : null}
        onValueChange={onChange}
      />
    </>
  );
}

export function SituationStage({
  situation,
  disabled,
  onChange,
}: {
  situation: string[];
  disabled: boolean;
  onChange: (value: string[]) => void;
}) {
  return (
    <ChoiceChips
      multiple
      label="Situations (optional)"
      options={situations}
      value={situation}
      disabled={disabled}
      onValueChange={onChange}
    />
  );
}

type ContextValues = { context: string; hours: string; minWeeks: string; maxWeeks: string };

export function ContextStage({
  values,
  contextLength,
  contextError,
  timingError,
  disabled,
  onChange,
}: {
  values: ContextValues;
  contextLength: number;
  contextError: boolean;
  timingError?: string;
  disabled: boolean;
  onChange: (key: keyof ContextValues, value: string) => void;
}) {
  const { context, hours, minWeeks, maxWeeks } = values;
  return (
    <>
      <TextArea
        label="Goal Context (optional)"
        placeholder="Your work, the situations you have coming up, or what you find hard."
        rows={4}
        value={context}
        disabled={disabled}
        onValueChange={(value) => onChange("context", value)}
        description={`${contextLength.toLocaleString("en")} / ${MAX_CONTEXT.toLocaleString("en")} characters including your selections`}
        error={contextError ? tooLong : undefined}
      />
      <TextField
        type="number"
        label="How much time can you spend practising each week? (optional)"
        description="Hours per week. For example, 1.5 means 1 hour 30 minutes."
        min={0.25}
        max={168}
        step={0.25}
        value={hours}
        disabled={disabled}
        onValueChange={(value) => onChange("hours", value)}
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
            disabled={disabled}
            onValueChange={(value) => onChange("minWeeks", value)}
          />
          <TextField
            type="number"
            label="Maximum weeks"
            min={Number(minWeeks) || 1}
            step={1}
            required={!!minWeeks}
            value={maxWeeks}
            disabled={disabled}
            onValueChange={(value) => onChange("maxWeeks", value)}
          />
        </Grid>
      </Stack>
      {timingError && <Notice tone="error">{timingError}</Notice>}
      <Text size="caption" tone="muted">
        Next, meet your coach. You can talk or type during your Assessment.
      </Text>
    </>
  );
}
