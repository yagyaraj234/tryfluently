import { useChat } from "@ai-sdk/react";
import {
  Button,
  ChatTurn,
  Cluster,
  EmptyState,
  ErrorState,
  FillGapStep,
  Heading,
  LiveBar,
  Notice,
  RewriteStep,
  Spinner,
  Stack,
  StepHeader,
  Text,
  TextArea,
} from "@impromptu/ui";
import { createFileRoute, redirect } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../../../api";
import { AssessmentEnding, Discarded, LeaveDialog, LIMIT_MS, TimeLeft, useAssessmentSession, type Assessment } from "../../../../assessment";
import { useRealtimeCall } from "../../../../call";
import { answerStep, chatOptions } from "../../../../chat";

export const Route = createFileRoute("/_signedIn/_practice/assessments/$assessmentId")({
  loader: async ({ params }) => {
    const response = await api().api.assessments[":id"].$get({ param: { id: params.assessmentId } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Couldn't load your Assessment (${response.status})`);
    const assessment = await response.json();
    if (assessment.status === "completed") throw redirect({ to: "/assessments/$assessmentId/report", params });
    return assessment;
  },
  component: AssessmentScreen,
});

/** One route for both modes: the Written and the Voice Assessment. */
function AssessmentScreen() {
  const assessment = Route.useLoaderData();
  if (!assessment) return <EmptyState title="We couldn't find that Assessment" description="It may belong to another account." />;
  if (assessment.status === "discarded") return <Discarded />;
  return assessment.mode === "written" ? <WrittenAssessment assessment={assessment} /> : <VoiceAssessment assessment={assessment} />;
}

// A live call with the coach. Ending it (End, 10:00, leaving, or a dropped call) goes through /end, which hangs it up.
function VoiceAssessment({ assessment }: { assessment: Assessment }) {
  const session = useAssessmentSession(assessment);
  const [dropped, setDropped] = useState(false);
  const running = session.ending === "running";
  const call = useRealtimeCall(`/api/assessments/${assessment.id}/call`, {
    // The API can't rejoin a call, so a dropped one ends the Assessment with what was said so far.
    onDropped: () => {
      if (!running) return;
      setDropped(true);
      void session.finish();
    },
  });

  // Mute while /end hangs up the call and writes the Report; let go of the call once that's done.
  const { mute, hangUp } = call;
  useEffect(() => {
    if (session.ending === "ending") mute(true);
    else if (session.ending !== "running") hangUp();
  }, [session.ending, mute, hangUp]);

  if (!running)
    return (
      <Stack gap={6}>
        {dropped && <Notice tone="info">Your call dropped, so the Assessment ended there.</Notice>}
        <AssessmentEnding session={session} />
      </Stack>
    );

  let screen;
  if (call.status === "microphone")
    screen = (
      <ErrorState
        title="Allow your microphone"
        description="The Voice Assessment needs your microphone. Allow it for Impromptu in your browser's site settings, or connect one, then try again."
        onRetry={call.retry}
      />
    );
  else if (call.status === "failed")
    screen =
      call.response?.status === 409 ? (
        <ErrorState
          title="You're already in a voice call"
          description="You can have one live call at a time. End the call in your other tab or window, then try again. A call that was cut off clears within a minute."
          onRetry={call.retry}
        />
      ) : (
        <ErrorState title="We couldn't connect your call" description="Check your connection and try again." onRetry={call.retry} />
      );
  else
    screen = (
      <Stack gap={6}>
        <LiveBar
          state={call.status === "live" || call.status === "reconnecting" ? call.status : "connecting"}
          title="Voice Assessment"
          elapsed={session.left === undefined ? undefined : LIMIT_MS - session.left}
          left={session.left}
          muted={call.muted}
          onMutedChange={call.mute}
          onEnd={() => void session.finish()}
        />
        <Stack gap={3}>
          <Heading level={1} size="title">
            Talk with your coach
          </Heading>
          <Text>
            Your coach starts the conversation. Speak as you would on a call, and interrupt whenever you like. Stay at least 4 minutes
            so it counts.
          </Text>
        </Stack>
      </Stack>
    );

  return (
    <>
      {screen}
      <LeaveDialog session={session} />
    </>
  );
}

type ItemPart = { type: "tool-fillGap" | "tool-rewrite"; toolCallId: string; state: string; input?: any; output?: { answer: string } };
const isItem = (part: UIMessage["parts"][number]): part is ItemPart & UIMessage["parts"][number] =>
  part.type === "tool-fillGap" || part.type === "tool-rewrite";

function WrittenAssessment({ assessment }: { assessment: Assessment }) {
  const session = useAssessmentSession(assessment);
  const { messages, sendMessage, addToolOutput, regenerate, status, error } = useChat(
    chatOptions(`/api/assessments/${assessment.id}/chat`, assessment.transcript as unknown as UIMessage[]),
  );
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const waiting = messages.at(-1)?.parts.find((p) => isItem(p) && p.state === "input-available");

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    void sendMessage({ text: draft.trim() });
    setDraft("");
  }

  if (session.ending !== "running") return <AssessmentEnding session={session} />;

  return (
    <Stack gap={6}>
      <Cluster justify="between">
        <Text size="label">Written Assessment</Text>
        <Cluster gap={4}>
          <TimeLeft left={session.left} />
          <Button variant="secondary" onClick={() => void session.finish()}>
            Finish
          </Button>
        </Cluster>
      </Cluster>
      {messages.length === 0 && (
        <Text tone="muted">
          Your coach will ask you about yourself and your work, and give you a few short items to answer. Say hello to begin.
        </Text>
      )}
      <Stack gap={5}>
        {messages.flatMap((message) =>
          message.parts.map((part, i) => {
            const key = `${message.id}-${i}`;
            if (part.type === "text")
              return (
                <ChatTurn key={key} from={message.role === "user" ? "learner" : "coach"}>
                  {part.text}
                </ChatTurn>
              );
            if (!isItem(part) || part.state === "input-streaming") return null;
            const item = {
              answered: part.state === "output-available" ? part.output?.answer : undefined,
              pending: busy,
              onAnswer: (answer: string) => void answerStep({ addToolOutput, sendMessage }, part, answer),
            };
            return part.type === "tool-fillGap" ? (
              <Stack key={key} gap={5}>
                <StepHeader type="Fill the gap" question="Complete the sentence." />
                <FillGapStep sentence={part.input.sentence} choices={part.input.choices} {...item} />
              </Stack>
            ) : (
              <Stack key={key} gap={5}>
                <StepHeader type="Rewrite" question={part.input.aim} />
                <RewriteStep sentence={part.input.sentence} {...item} />
              </Stack>
            );
          }),
        )}
        {status === "submitted" && <Spinner label="Your coach is writing" />}
      </Stack>
      {error && (
        <Stack gap={3} align="start">
          <Notice tone="error">We couldn't send that. Check your connection and try again.</Notice>
          <Button variant="secondary" onClick={() => void regenerate()}>
            Try again
          </Button>
        </Stack>
      )}
      {!waiting && (
        <form onSubmit={send}>
          <Stack gap={3}>
            <TextArea label="Your answer" value={draft} onValueChange={setDraft} rows={3} />
            <Button type="submit" disabled={busy || !draft.trim()}>
              Send
            </Button>
          </Stack>
        </form>
      )}
      <LeaveDialog session={session} />
    </Stack>
  );
}
