import { Hourglass } from "@phosphor-icons/react";
import { Button, Card, EmptyState, Heading, Stack, Text } from "@impromptu/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useRecorder } from "../../hooks/voice";
import { Complete } from "./Complete";
import { lessonXp, type Lesson } from "./lesson";
import { stepKinds } from "./stepKinds";

type Report = {
  summary?: string;
  objectiveProgress?: number;
  skills?: Record<string, { score: number; evidence: string[] } | null>;
};
type Question = NonNullable<Lesson["questions"]>[number];

const noReport = <Text tone="muted">No detailed report is available for this Lesson.</Text>;

function SkillResult({ skill, result }: { skill: string; result: { score: number; evidence: string[] } }) {
  return (
    <Stack gap={2}>
      <Text>
        {skill}: {result.score}/100
      </Text>
      {result.evidence.map((quote, i) => (
        <Text key={i} tone="muted">
          {quote}
        </Text>
      ))}
    </Stack>
  );
}

function ReportCard({ report }: { report: Report }) {
  return (
    <Card>
      <Stack gap={4}>
        <Text>{report.summary}</Text>
        <Text>Objective progress: {report.objectiveProgress ?? 0}%</Text>
        {Object.entries(report.skills ?? {}).map(
          ([skill, result]) => result && <SkillResult key={skill} skill={skill} result={result} />,
        )}
      </Stack>
    </Card>
  );
}

function AnsweredStep({ step }: { step: Lesson["steps"][number] }) {
  return (
    <Card>
      <Stack gap={2}>
        <Heading level={3} size="title">
          {String(step.input.sentence ?? step.input.question ?? step.input.word ?? `Question ${step.position + 1}`)}
        </Heading>
        <Text>Your answer: {String(step.output?.answer ?? "")}</Text>
        {step.feedback && (
          <>
            <Text>{step.feedback.verdict}</Text>
            <Text>{step.feedback.corrected}</Text>
            <Text tone="muted">{step.feedback.explanation}</Text>
          </>
        )}
      </Stack>
    </Card>
  );
}

function CompletedReport({ lesson }: { lesson: Lesson }) {
  const report = lesson.report as Report | null;
  return (
    <Stack gap={6}>
      <Heading level={1}>Lesson Report</Heading>
      {report ? <ReportCard report={report} /> : noReport}
      {lesson.steps.map((step) => (
        <AnsweredStep key={step.id} step={step} />
      ))}
      <Complete headingLevel={2} xpGained={lessonXp(lesson.steps.filter((s) => s.answeredAt).length)} />
    </Stack>
  );
}

function LearningMaterial({
  material,
  busy,
  onStart,
}: {
  material: NonNullable<Lesson["material"]>;
  busy: boolean;
  onStart: () => void;
}) {
  return (
    <>
      {material.map((section, i) => (
        <Card key={i}>
          <Stack gap={3}>
            <Heading level={2} size="title">
              {section.title}
            </Heading>
            <Text>{section.body}</Text>
            {section.example && <Text tone="muted">{section.example}</Text>}
          </Stack>
        </Card>
      ))}
      <Button disabled={busy} onClick={onStart}>
        Start assessment
      </Button>
    </>
  );
}

function QuestionCard({
  question,
  number,
  total,
  render,
}: {
  question: Question;
  number: number;
  total: number;
  render: () => ReactNode;
}) {
  return (
    <Card>
      <Stack gap={5}>
        <Text size="label">
          Question {number} of {total}
        </Text>
        {question.type === "speakPrompt" && <Text>{String(question.input.question ?? "")}</Text>}
        {question.type === "rewrite" && <Text>{String(question.input.aim ?? "")}</Text>}
        <Fragment key={question.id}>{render()}</Fragment>
      </Stack>
    </Card>
  );
}

function FinishCard({ busy, onFinish }: { busy: boolean; onFinish: () => void }) {
  return (
    <Card>
      <Stack gap={4}>
        <Text>Every answer is saved. Finish to see your report.</Text>
        <Button disabled={busy} onClick={onFinish}>
          {busy ? "Preparing your report…" : "See my report"}
        </Button>
      </Stack>
    </Card>
  );
}

export function PreparedPlayer({ lesson }: { lesson: Lesson }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const questions = lesson.questions ?? [];
  const question = questions.find((q) => !q.answeredAt);

  async function act(path: "assessment" | "answers" | "finish", body = {}) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/lessons/${lesson.id}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Your progress couldn't be saved. Try again.");
      await queryClient.invalidateQueries();
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  const recorder = useRecorder(`/api/lessons/${lesson.id}/recordings`, ({ recordingId }) => {
    if (question) void act("answers", { stepId: question.id, recordingId });
  });
  const { reset } = recorder;
  useEffect(() => {
    reset();
  }, [question?.id, reset]);

  if (lesson.status === "completed") return <CompletedReport lesson={lesson} />;
  if (lesson.preparation !== "ready")
    return (
      <EmptyState
        icon={Hourglass}
        title="This Lesson isn't ready yet"
        description="Return to your Roadmap to retry preparation."
        action={<Button render={<Link to="/roadmap" />}>Back to Roadmap</Button>}
      />
    );

  let body;
  if (lesson.phase === "learning")
    body = <LearningMaterial material={lesson.material ?? []} busy={busy} onStart={() => void act("assessment")} />;
  else if (question)
    body = (
      <QuestionCard
        question={question}
        number={questions.indexOf(question) + 1}
        total={questions.length}
        render={() =>
          stepKinds[question.type]?.render(
            question.input,
            { pending: busy, onAnswer: (answer) => void act("answers", { stepId: question.id, answer }) },
            {
              recording: recorder.state,
              onStart: () => void recorder.start(),
              onStop: recorder.stop,
              onRetry: recorder.retry,
            },
          )
        }
      />
    );
  else body = <FinishCard busy={busy} onFinish={() => void act("finish")} />;

  return (
    <Stack gap={6}>
      <Heading level={1}>{lesson.title}</Heading>
      {error && <p role="alert">{error}</p>}
      {body}
    </Stack>
  );
}
