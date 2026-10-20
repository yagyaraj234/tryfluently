import { Button, LessonStage, Stack, StepFeedback, StepHeader, Text } from "@impromptu/ui";
import { useState } from "react";
import type { Feedback, Lesson } from "./lesson";
import { displayAnswer, stepKinds } from "./stepKinds";

const silent = { recording: { status: "idle" as const }, onStart: () => {}, onStop: () => {}, onRetry: () => {} };

function Teaching({ teaching }: { teaching: { body: string; example?: string } }) {
  return (
    <Stack gap={3}>
      <Text>{teaching.body}</Text>
      {teaching.example && <Text tone="muted">{teaching.example}</Text>}
    </Stack>
  );
}

export function LessonReview({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = lesson.steps[index]!;
  const k = stepKinds[step.type];
  const feedback = step.feedback as Feedback | null;
  const input = step.input as any;
  const output = step.output as { answer?: string } | null;
  const answer = output?.answer ? displayAnswer(step.type, input, output.answer) : undefined;
  const last = index + 1 >= lesson.steps.length;
  const next = () => (last ? onClose() : setIndex(index + 1));

  const body = feedback ? (
    <StepFeedback
      {...feedback}
      answer={answer}
      nextLabel={last ? "Finish review" : "Next reviewed Step"}
      onNext={next}
    />
  ) : (
    <>
      <Text>{answer ?? "No saved answer"}</Text>
      <Button onClick={next}>Continue</Button>
    </>
  );

  return (
    <LessonStage>
      <Text size="label" tone="muted">
        Review · {index + 1} of {lesson.steps.length} · no new XP
      </Text>
      {k && <StepHeader type={k.type} question={k.question(input)} />}
      {input.teaching && <Teaching teaching={input.teaching} />}
      {k && k.render(input, { answered: output?.answer ?? "", pending: true, onAnswer: () => {} }, silent)}
      {body}
      <Button variant="secondary" onClick={onClose}>
        Back to Lesson summary
      </Button>
    </LessonStage>
  );
}
