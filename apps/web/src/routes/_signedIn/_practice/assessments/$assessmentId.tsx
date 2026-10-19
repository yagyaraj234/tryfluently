import { useChat } from "@ai-sdk/react";
import {
  Button,
  ChatTurn,
  Cluster,
  EmptyState,
  ErrorState,
  FillGapStep,
  Heading,
  CoachCall,
  CoachAvatar,
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
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../../../lib/api";
import { AssessmentEnding, Discarded, LeaveDialog, TimeLeft, useAssessmentSession, type Assessment } from "../../../../components/assessment/assessment";
import { useRealtimeCall } from "../../../../lib/call";
import { answerStep, chatOptions } from "../../../../lib/chat";

export const Route = createFileRoute("/_signedIn/_practice/assessments/$assessmentId")({
  loader: { staleReloadMode: "blocking", handler: async ({ params }) => {
    const response = await api().api.assessments[":id"].$get({ param: { id: params.assessmentId } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Couldn't load your Assessment (${response.status})`);
    const assessment = await response.json();
    if (assessment.status === "completed") throw redirect({ to: "/assessments/$assessmentId/report", params });
    return assessment;
  } },
  component: AssessmentScreen,
});

/** One route for both modes: the Written and the Voice Assessment. */
function AssessmentScreen() {
  const assessment = Route.useLoaderData();
  if (!assessment) return <EmptyState title="We couldn't find that Assessment" description="It may belong to another account." />;
  if (assessment.status === "discarded") return <Discarded />;
  return assessment.mode === "written" ? <WrittenAssessment key={assessment.id} assessment={assessment} /> : <VoiceAssessment key={assessment.id} assessment={assessment} />;
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
      <CoachCall
        connection={call.status === "live" || call.status === "reconnecting" ? call.status : "connecting"}
        state={call.status === "live" ? call.conversation.phase : "ready"} caption={call.conversation.caption} speaker={call.conversation.speaker}
        muted={call.muted} onMutedChange={call.mute} onEnd={() => void session.finish()}>
        <TimeLeft left={session.left} />
      </CoachCall>
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
  const { messages, sendMessage, addToolOutput, regenerate, status, error } = useChat({
    id: assessment.id, ...chatOptions(`/api/assessments/${assessment.id}/chat`, assessment.transcript as unknown as UIMessage[]),
  });
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const waiting = messages.at(-1)?.parts.find((p) => isItem(p) && p.state === "input-available");
  const started = useRef(false);
  useEffect(() => {
    if (messages.length || started.current || session.ending !== "running") return;
    const timer = setTimeout(() => {
      started.current = true;
      void sendMessage({ id: `assessment-start-${assessment.id}`, role: "user", parts: [{ type: "text", text: "I’m ready to start my Assessment. Please introduce yourself and begin." }] });
    });
    return () => clearTimeout(timer);
  }, [assessment.id, messages.length, sendMessage, session.ending]);


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
      <Cluster wrap={false} gap={3}><CoachAvatar small /><Stack gap={1}><Heading level={1} size="title">Your conversation with Impromptu</Heading><Text size="caption" tone="muted">Your AI coach · one question at a time</Text></Stack></Cluster>
      <Stack gap={5}>
        {messages.filter((message) => message.id !== `assessment-start-${assessment.id}`).flatMap((message) =>
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
            <TextArea label="Your message to your coach" placeholder="Take your time. Write as you would in a conversation…" value={draft} onValueChange={setDraft} rows={3} />
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
