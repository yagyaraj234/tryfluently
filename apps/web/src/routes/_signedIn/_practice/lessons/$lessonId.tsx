import { useChat } from "@ai-sdk/react";
import {
  Button,
  ErrorState,
  EmptyState,
  FillGapStep,
  LessonComplete,
  LoadingState,
  RewriteStep,
  SpeakPromptStep,
  Stack,
  StepFeedback,
  StepHeader,
  Text,
  toastManager,
  VocabCardStep,
  type FillGapStepProps,
  type RewriteStepProps,
  type VocabCardStepProps,
  type VoiceProps,
} from "@impromptu/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import type { ToolUIPart, UIMessage } from "ai";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../../../lib/api";
import { answerStep, chatOptions } from "../../../../lib/chat";
import { lessonRoute, useNextLesson } from "../../../../lib/lessons";
import { progressQuery } from "../../../../lib/queries";
import { canHear, hearIt, useRecorder } from "../../../../hooks/voice";

async function fetchLesson(id: string) {
  const response = await api().api.lessons[":id"].$get({ param: { id } });
  if (!response.ok) throw new Error(`Couldn't load your Lesson (${response.status})`);
  const lesson = await response.json();
  // Stored UI messages; the API checks them against the tool schemas.
  return { ...lesson, messages: lesson.messages as unknown as UIMessage[] };
}

type Lesson = Awaited<ReturnType<typeof fetchLesson>>;

export const Route = createFileRoute("/_signedIn/_practice/lessons/$lessonId")({
  // useChat seeds history once per mount; don't mount it from stale route data on a return visit.
  loader: { staleReloadMode: "blocking", handler: async ({ params, context }) => {
    // The Streak is available on the completion screen without another loading boundary.
    const [lesson] = await Promise.all([fetchLesson(params.lessonId), context.queryClient.prefetchQuery(progressQuery)]);
    if (lesson.kind === "roleplay") throw redirect(lessonRoute(lesson));
    return lesson;
  } },
  component: LessonScreen,
  errorComponent: LessonError,
});

function LessonError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const description = error instanceof Error ? error.message : undefined;
  return <ErrorState title="Your Lesson couldn't be loaded" description={description} onRetry={() => router.invalidate()} />;
}

function LessonScreen() {
  const lesson = Route.useLoaderData();
  // A new Lesson (from Lesson complete's "Next Lesson") gets a fresh player.
  if (lesson.status === "abandoned")
    return <EmptyState title="This Lesson has ended" description="Its Unit was skipped. Continue with your active Unit." action={<Button render={<Link to="/home" />}>Back to Home</Button>} />;
  return lesson.status === "in_progress"
    ? <Player key={lesson.id} lesson={lesson} />
    : <Complete xpGained={20 + 10 * lesson.steps.filter((s) => s.answeredAt).length} />;
}

// ---- Step types --------------------------------------------------------------------------------------------------
// Each Step type's header and body. The app passes the Step's input straight through.

// A typed answer. A recorded one goes through `voice` and is sent as `{ recordingId }`; see answerStep.
type Answer = { onAnswer: (answer: string) => void; pending: boolean; answered?: string };
type StepKind<I> = { type: string; question: (input: I) => string; render: (input: I, answer: Answer, voice: VoiceProps) => ReactNode };
const kind = <I,>(k: StepKind<I>) => k as StepKind<unknown>;

/** Plays a Reference Pronunciation, with a toast if it can't. */
const play = (text: string) =>
  hearIt(text).catch(() => toastManager.add({ title: "The audio couldn't be played", description: "Try again in a moment." }));

const stepKinds: Record<string, StepKind<unknown>> = {
  vocabCard: kind<Omit<VocabCardStepProps, keyof Answer>>({
    type: "New word",
    question: (input) => `Use "${input.word}" in a sentence of your own`,
    render: (input, answer, voice) => <VocabCardStep {...input} {...answer} voice={voice} onHearIt={() => void play(input.word)} />,
  }),
  fillGap: kind<Omit<FillGapStepProps, keyof Answer>>({
    type: "Fill the gap",
    question: () => "Complete the sentence",
    render: (input, answer) => <FillGapStep {...input} {...answer} />,
  }),
  rewrite: kind<Omit<RewriteStepProps, keyof Answer> & { aim: string }>({
    type: "Rewrite",
    question: (input) => input.aim,
    render: (input, answer) => <RewriteStep {...input} {...answer} />,
  }),
  speakPrompt: kind<{ question: string; targetSeconds: number }>({
    type: "Speak",
    question: (input) => input.question,
    render: (input, answer, voice) => <SpeakPromptStep targetSeconds={input.targetSeconds} {...answer} {...voice} />,
  }),
};

// Lessons adapt (3 to 10 Steps), so the header shows an estimate that stays ahead of the Learner.
const EXPECTED_STEPS = 5;

function Header({ step, position }: { step: ToolUIPart; position: number }) {
  const k = stepKinds[stepName(step)]!;
  const progress = { position, total: Math.max(EXPECTED_STEPS, position + 1) };
  return <StepHeader type={k.type} progress={progress} question={k.question(step.input)} />;
}

// ---- Reading the chat --------------------------------------------------------------------------------------------

const stepName = (p: { type: string }) => p.type.replace(/^tool-/, "");
const isTool = (p: UIMessage["parts"][number]): p is ToolUIPart => p.type.startsWith("tool-");

type Feedback = { verdict: "correct" | "almost" | "incorrect"; corrected: string; explanation: string };

function read(messages: UIMessage[]) {
  const parts = messages.flatMap((m) => (m.role === "assistant" ? m.parts.filter(isTool) : []));
  const steps = parts.filter((p) => stepName(p) in stepKinds);
  const last = steps.at(-1);
  return {
    steps,
    pending: last?.state === "input-available" ? last : undefined,
    ended: parts.some((p) => p.type === "tool-endLesson" && p.state === "output-available"),
    // The giveFeedback that follows a Step. The server's verdict (its output) wins over the model's.
    feedbackFor(step: ToolUIPart): Feedback | undefined {
      const fb = parts.slice(parts.indexOf(step) + 1).find((p) => p.type === "tool-giveFeedback");
      if (fb?.state !== "output-available") return;
      const input = fb.input as Feedback;
      return { ...input, verdict: (fb.output as Partial<Feedback>)?.verdict ?? input.verdict };
    },
  };
}

// ---- The player --------------------------------------------------------------------------------------------------

const NUDGE_LIMIT = 2;

function Player({ lesson }: { lesson: Lesson }) {
  const queryClient = useQueryClient();
  const chat = useChat({
    id: lesson.id, ...chatOptions(`/api/lessons/${lesson.id}/chat`, lesson.messages),
    onFinish: () => { void queryClient.invalidateQueries(progressQuery); },
  });
  const { steps, pending, ended, feedbackFor } = read(chat.messages);
  const busy = chat.status === "submitted" || chat.status === "streaming";

  // The Step the Learner just answered, kept on screen with its feedback until they move on.
  const [reviewingId, setReviewingId] = useState<string>();
  // Answers since the last Step was asked for; see the nudge below.
  const nudges = useRef(0);
  function answer(step: ToolUIPart, output: string | { recordingId: string }) {
    nudges.current = 0;
    setReviewingId(step.toolCallId);
    void answerStep(chat, step, output);
  }

  // One recorder for the whole Lesson, so a cap or a denied microphone carries over to the next Step.
  // The transcript is kept for the answered Step's feedback, since the recorder resets for the next Step.
  const [said, setSaid] = useState<{ stepId: string; text: string }>();
  const recorder = useRecorder(`/api/lessons/${lesson.id}/recordings`, ({ recordingId, text }) => {
    if (!pending) return;
    setSaid({ stepId: pending.toolCallId, text });
    answer(pending, { recordingId });
  });
  const voice: VoiceProps = { recording: recorder.state, onStart: () => void recorder.start(), onStop: recorder.stop, onRetry: recorder.retry };
  const { reset } = recorder;
  const pendingId = pending?.toolCallId;
  useEffect(() => {
    if (pendingId) reset();
  }, [pendingId, reset]);

  const reviewing = steps.find((s) => s.toolCallId === reviewingId);
  const feedback = reviewing && feedbackFor(reviewing);
  // A turn that finished without feedback has nothing to review.
  const showReview = reviewing && (feedback || busy);

  // With no Step waiting (a new Lesson, or a turn that ended without one), ask for the next Step.
  // Limited, so a model that keeps replying without a Step can't loop.
  const nudgedAt = useRef(-1);
  const [stuck, setStuck] = useState(false);
  const idle = chat.status === "ready" && !showReview && !ended && !pending;
  const { sendMessage } = chat;
  const count = chat.messages.length;
  useEffect(() => {
    if (!idle || nudgedAt.current === count) return;
    // Deferred and cancelled on cleanup: under StrictMode useChat stops the chat on the extra unmount,
    // which would abort a request sent straight away.
    const timer = setTimeout(() => {
      if (nudges.current >= NUDGE_LIMIT) return setStuck(true);
      nudgedAt.current = count;
      nudges.current++;
      void sendMessage({ text: count ? "Next step, please." : "Let's start." });
    });
    return () => clearTimeout(timer);
  }, [idle, count, sendMessage]);

  // When the Lesson ends, the Roadmap and progress move on; refetch them for Lesson complete.
  useEffect(() => {
    if (!ended) return;
    void queryClient.invalidateQueries();
  }, [ended, queryClient]);

  // Reload from the server (it keeps the history) and carry on from there.
  async function retry() {
    const fresh = await fetchLesson(lesson.id);
    chat.setMessages(fresh.messages);
    chat.clearError();
    nudges.current = 0;
    nudgedAt.current = -1;
    setReviewingId(undefined);
    setStuck(false);
  }

  if (chat.error || stuck)
    return <ErrorState title="Your Step couldn't be loaded" description="Your answers so far are saved." onRetry={() => void retry()} />;

  if (showReview) {
    const position = steps.indexOf(reviewing) + 1;
    const output = reviewing.output as { answer?: unknown; recordingId?: unknown } | undefined;
    const typed = typeof output?.answer === "string" ? output.answer : undefined;
    const spoken = typeof output?.recordingId === "string";
    const transcript = spoken && said?.stepId === reviewing.toolCallId ? said.text : undefined;
    return (
      <Stack gap={6}>
        <Header step={reviewing} position={position} />
        {feedback ? (
          <StepFeedback
            {...feedback}
            answer={typed ?? transcript}
            spoken={spoken}
            nextLabel={ended ? "See how you did" : "Next step"}
            onNext={() => setReviewingId(undefined)}
            onHearIt={canHear(feedback.corrected) ? () => void play(feedback.corrected) : undefined}
          />
        ) : (
          <>
            {stepKinds[stepName(reviewing)]!.render(
              reviewing.input,
              { onAnswer: () => {}, pending: true, answered: typed },
              transcript ? { ...voice, recording: { status: "done", text: transcript } } : voice,
            )}
            <LoadingState title="Checking your answer" />
          </>
        )}
      </Stack>
    );
  }

  if (ended) return <Complete xpGained={20 + 10 * steps.filter((s) => s.state === "output-available").length} />;

  if (!pending)
    return (
      <LoadingState
        title={steps.length ? "Preparing your next Step" : "Preparing your first Step"}
        description="Each Step is built from how you did on the last one."
      />
    );

  const step = pending;
  return (
    <Stack gap={6}>
      <Header step={step} position={steps.length} />
      {/* Keyed, so a Step's own state (like "Type instead") doesn't carry over to the next. */}
      <Fragment key={step.toolCallId}>{stepKinds[stepName(step)]!.render(step.input, { pending: busy, onAnswer: (a) => answer(step, a) }, voice)}</Fragment>
    </Stack>
  );
}

// ---- Lesson complete ---------------------------------------------------------------------------------------------

/** XP belongs to the whole Lesson, including answers from before a resume. */
function Complete({ xpGained }: { xpGained: number }) {
  const progress = useQuery(progressQuery);
  const next = useNextLesson();
  if (progress.isPending || progress.isFetching) return <LoadingState title="Adding up your XP" />;
  return (
    <Stack gap={4}>
      <LessonComplete
        xpGained={xpGained}
        streak={progress.data?.streak ?? 0}
        actions={
          <>
            <Button onClick={() => next.mutate()} disabled={next.isPending || next.isSuccess}>
              Next Lesson
            </Button>
            <Button variant="secondary" render={<Link to="/home" />}>
              Back to Home
            </Button>
          </>
        }
      />
      {next.isError && <Text tone="muted">Your next Lesson couldn't be prepared. Try again in a moment.</Text>}
    </Stack>
  );
}
