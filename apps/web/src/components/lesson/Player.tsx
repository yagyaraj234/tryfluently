import { useChat } from "@ai-sdk/react";
import {
  ErrorState,
  LessonStage,
  LoadingState,
  StepFeedback,
  TeachingPage,
  TextLink,
  type VoiceProps,
} from "@impromptu/ui";
import { useQueryClient } from "@tanstack/react-query";
import type { ToolUIPart } from "ai";
import { Fragment, useEffect, useRef, useState } from "react";
import { canHear, useRecorder } from "../../hooks/voice";
import { answerStep, chatOptions } from "../../lib/chat";
import { progressQuery } from "../../lib/queries";
import { Complete } from "./Complete";
import { fetchLesson, lessonXp, type Feedback, type Lesson } from "./lesson";
import { displayAnswer, Header, play, read, stepKinds, stepName } from "./stepKinds";

const NUDGE_LIMIT = 2;

type Teaching = { title: string; body: string; example?: string };

function ReviewStage({
  step,
  position,
  feedback,
  ended,
  said,
  voice,
  onNext,
}: {
  step: ToolUIPart;
  position: number;
  feedback?: Feedback;
  ended: boolean;
  said?: { stepId: string; text: string };
  voice: VoiceProps;
  onNext: () => void;
}) {
  const output = step.output as { answer?: unknown; recordingId?: unknown } | undefined;
  const typed = typeof output?.answer === "string" ? output.answer : undefined;
  const spoken = typeof output?.recordingId === "string";
  const transcript = spoken && said?.stepId === step.toolCallId ? said.text : undefined;

  const body = feedback ? (
    <StepFeedback
      {...feedback}
      answer={typed ? displayAnswer(stepName(step), step.input, typed) : transcript}
      spoken={spoken}
      nextLabel={ended ? "See how you did" : "Continue"}
      onNext={onNext}
      onHearIt={canHear(feedback.corrected) ? () => void play(feedback.corrected) : undefined}
    />
  ) : (
    <>
      {stepKinds[stepName(step)]!.render(
        step.input,
        { onAnswer: () => {}, pending: true, answered: typed },
        transcript ? { ...voice, recording: { status: "done", text: transcript } } : voice,
      )}
      <LoadingState title="Checking your answer" />
    </>
  );

  return (
    <LessonStage>
      <Header step={step} position={position} />
      {body}
    </LessonStage>
  );
}

function StepStage({
  step,
  position,
  teaching,
  showTeaching,
  busy,
  voice,
  backDisabled,
  onAnswer,
  onTeachingNext,
  onBack,
}: {
  step: ToolUIPart;
  position: number;
  teaching?: Teaching;
  showTeaching: boolean;
  busy: boolean;
  voice: VoiceProps;
  backDisabled: boolean;
  onAnswer: (answer: string) => void;
  onTeachingNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      {showTeaching && <TeachingPage {...teaching!} onNext={onTeachingNext} />}
      <div hidden={showTeaching}>
        <LessonStage>
          <Header step={step} position={position} />
          {teaching && (
            <TextLink disabled={backDisabled} onClick={onBack}>
              Back to the idea
            </TextLink>
          )}
          {/* Keyed, so a Step's own state (like "Type instead") doesn't carry over to the next. */}
          <Fragment key={step.toolCallId}>
            {stepKinds[stepName(step)]!.render(step.input, { pending: busy, onAnswer }, voice)}
          </Fragment>
        </LessonStage>
      </div>
    </>
  );
}

export function Player({ lesson }: { lesson: Lesson }) {
  const queryClient = useQueryClient();
  const chat = useChat({
    id: lesson.id,
    ...chatOptions(`/api/lessons/${lesson.id}/chat`, lesson.messages),
    onFinish: () => {
      void queryClient.invalidateQueries(progressQuery);
    },
  });
  const { steps, pending, ended, feedbackFor } = read(chat.messages);
  const busy = chat.status === "submitted" || chat.status === "streaming";

  const [reviewingId, setReviewingId] = useState<string | undefined>(
    () => read(lesson.messages).steps.findLast((s) => s.state === "output-available")?.toolCallId,
  );
  const [taughtId, setTaughtId] = useState<string>();
  const nudges = useRef(0);
  function answer(step: ToolUIPart, output: string | { recordingId: string }) {
    nudges.current = 0;
    setReviewingId(step.toolCallId);
    void answerStep(chat, step, output);
  }

  // One recorder for the whole Lesson, so a cap or a denied microphone carries over to the next Step.
  const [said, setSaid] = useState<{ stepId: string; text: string }>();
  const recorder = useRecorder(`/api/lessons/${lesson.id}/recordings`, ({ recordingId, text }) => {
    if (!pending) return;
    setSaid({ stepId: pending.toolCallId, text });
    answer(pending, { recordingId });
  });
  const voice: VoiceProps = {
    recording: recorder.state,
    onStart: () => void recorder.start(),
    onStop: recorder.stop,
    onRetry: recorder.retry,
  };
  const { reset } = recorder;
  const pendingId = pending?.toolCallId;
  useEffect(() => {
    if (pendingId) reset();
  }, [pendingId, reset]);

  const reviewing = steps.find((s) => s.toolCallId === reviewingId);
  const feedback = reviewing && feedbackFor(reviewing);
  const showReview = reviewing && (feedback || busy);

  // Limited, so a model that keeps replying without a Step can't loop.
  const nudgedAt = useRef(-1);
  const [stuck, setStuck] = useState(false);
  const idle = chat.status === "ready" && !showReview && !ended && !pending;
  const { sendMessage } = chat;
  const count = chat.messages.length;
  useEffect(() => {
    if (!idle || nudgedAt.current === count) return;
    // Deferred and cancelled on cleanup: under StrictMode useChat stops the chat on the extra unmount,
    const timer = setTimeout(() => {
      if (nudges.current >= NUDGE_LIMIT) return setStuck(true);
      nudgedAt.current = count;
      nudges.current++;
      void sendMessage({ text: count ? "Next step, please." : "Let's start." });
    });
    return () => clearTimeout(timer);
  }, [idle, count, sendMessage]);

  useEffect(() => {
    if (!ended) return;
    void queryClient.invalidateQueries();
  }, [ended, queryClient]);

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
    return (
      <ErrorState
        title="Your Step couldn't be loaded"
        description="Your answers so far are saved."
        onRetry={() => void retry()}
      />
    );

  if (showReview)
    return (
      <ReviewStage
        step={reviewing}
        position={steps.indexOf(reviewing) + 1}
        feedback={feedback}
        ended={ended}
        said={said}
        voice={voice}
        onNext={() => setReviewingId(undefined)}
      />
    );

  if (ended) return <Complete xpGained={lessonXp(steps.filter((s) => s.state === "output-available").length)} />;

  if (!pending)
    return (
      <LoadingState
        title={steps.length ? "Preparing your next Step" : "Preparing your first Step"}
        description="Each Step uses how you did on the last one."
      />
    );

  const teaching = (pending.input as { teaching?: Teaching }).teaching;
  return (
    <StepStage
      step={pending}
      position={steps.length}
      teaching={teaching}
      showTeaching={Boolean(teaching && taughtId !== pending.toolCallId)}
      busy={busy}
      voice={voice}
      backDisabled={recorder.state.status === "recording" || recorder.state.status === "processing"}
      onAnswer={(a) => answer(pending, a)}
      onTeachingNext={() => setTaughtId(pending.toolCallId)}
      onBack={() => setTaughtId(undefined)}
    />
  );
}
