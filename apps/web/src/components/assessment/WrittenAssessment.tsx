import { useChat } from "@ai-sdk/react";
import {
  Button,
  ChatComposer,
  ChatThread,
  ChatTurn,
  ChatWriting,
  Cluster,
  CoachAvatar,
  FillGapStep,
  Heading,
  Notice,
  RewriteStep,
  Stack,
  StepHeader,
  Text,
} from "@fluently/ui";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { answerStep, chatOptions } from "../../lib/chat";
import { AssessmentEnding, LeaveDialog, MAX_ANSWERS, useAssessmentSession, type Assessment } from "./assessment";

type Part = UIMessage["parts"][number];
type ItemPart = {
  type: "tool-fillGap" | "tool-rewrite";
  toolCallId: string;
  state: string;
  input?: any;
  output?: { answer: string };
};
const isItem = (part: Part): part is ItemPart & Part => part.type === "tool-fillGap" || part.type === "tool-rewrite";

function Item({ part, busy, onAnswer }: { part: ItemPart & Part; busy: boolean; onAnswer: (answer: string) => void }) {
  const item = {
    answered: part.state === "output-available" ? part.output?.answer : undefined,
    pending: busy,
    onAnswer,
  };
  if (part.type === "tool-fillGap")
    return (
      <Stack gap={5}>
        <StepHeader type="Fill the gap" question="Complete the sentence." />
        <FillGapStep sentence={part.input.sentence} choices={part.input.choices} {...item} />
      </Stack>
    );
  return (
    <Stack gap={5}>
      <StepHeader type="Rewrite" question={part.input.aim} />
      <RewriteStep sentence={part.input.sentence} {...item} />
    </Stack>
  );
}

function Header({ onFinish }: { onFinish: () => void }) {
  return (
    <>
      <Cluster justify="between">
        <Text size="label">Written Assessment</Text>
        <Button variant="secondary" onClick={onFinish}>
          Finish
        </Button>
      </Cluster>
      <Cluster wrap={false} gap={3}>
        <CoachAvatar small />
        <Stack gap={1}>
          <Heading level={1} size="title">
            Your conversation with Fluently
          </Heading>
          <Text size="caption" tone="muted">
            Your AI coach · one question at a time
          </Text>
        </Stack>
      </Cluster>
    </>
  );
}

export function WrittenAssessment({ assessment }: { assessment: Assessment }) {
  const session = useAssessmentSession(assessment, false);
  const chat = useChat({
    id: assessment.id,
    ...chatOptions(`/api/assessments/${assessment.id}/chat`, assessment.transcript as unknown as UIMessage[]),
  });
  const { messages, sendMessage, addToolOutput, regenerate, status, error } = chat;
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";
  const started = useRef(false);
  const startId = `assessment-start-${assessment.id}`;
  // The opening message is machinery, not something the Learner wrote.
  const shown = messages.filter((message) => message.id !== startId);
  const waitingItem = shown.at(-1)?.parts.find((p) => isItem(p) && p.state === "input-available");
  const last = messages.at(-1);
  const latestText =
    last?.role === "assistant" ? last.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("") : "";
  // The reply has started, but there are no words or a finished item to show yet.
  const waiting = status === "submitted" || (status === "streaming" && !latestText && !waitingItem);
  const streamingId = status === "streaming" && last?.role === "assistant" && latestText ? last.id : undefined;
  const lastTextIndex = last ? last.parts.reduce((at, part, i) => (part.type === "text" ? i : at), -1) : -1;

  // Once the last question is answered and the coach has closed, write the Report.
  const answers =
    shown.filter((message) => message.role === "user").length +
    shown.flatMap((message) => message.parts).filter((p) => isItem(p) && p.state === "output-available").length;
  const { ending, finish } = session;
  useEffect(() => {
    if (answers >= MAX_ANSWERS && status === "ready" && ending === "running") void finish();
  }, [answers, status, ending, finish]);

  useEffect(() => {
    if (messages.length || started.current || session.ending !== "running") return;
    const timer = setTimeout(() => {
      started.current = true;
      void sendMessage({
        id: startId,
        role: "user",
        parts: [{ type: "text", text: "I’m ready to start my Assessment. Please introduce yourself and begin." }],
      });
    });
    return () => clearTimeout(timer);
  }, [assessment.id, messages.length, sendMessage, session.ending, startId]);

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setDraft("");
  }

  if (session.ending !== "running") return <AssessmentEnding session={session} />;

  const turns = shown.flatMap((message) =>
    message.parts.map((part, i) => {
      const key = `${message.id}-${i}`;
      if (part.type === "text")
        return part.text ? (
          <ChatTurn
            key={key}
            from={message.role === "user" ? "learner" : "coach"}
            streaming={message.id === streamingId && i === lastTextIndex}
          >
            {part.text}
          </ChatTurn>
        ) : null;
      if (!isItem(part) || part.state === "input-streaming") return null;
      return (
        <Item
          key={key}
          part={part}
          busy={busy}
          onAnswer={(answer) => void answerStep({ addToolOutput, sendMessage }, part, answer)}
        />
      );
    }),
  );
  const thread = (shown.length > 0 || waiting) && (
    <ChatThread label="Conversation with your coach" busy={busy}>
      {turns}
      {waiting && <ChatWriting name="Your coach" />}
    </ChatThread>
  );
  const errorNotice = error && (
    <Stack gap={3} align="start">
      <Notice tone="error">We couldn't send that. Check your connection and try again.</Notice>
      <Button variant="secondary" onClick={() => void regenerate()}>
        Try again
      </Button>
    </Stack>
  );
  const composer = !waitingItem && (
    <ChatComposer
      label="Your message to your coach"
      placeholder="Take your time. Write as you would in a conversation…"
      value={draft}
      onValueChange={setDraft}
      onSend={send}
      pending={status === "submitted"}
      disabled={busy}
    />
  );

  return (
    <Stack gap={6}>
      <Header onFinish={() => void session.finish()} />
      {thread}
      {errorNotice}
      {composer}
      <LeaveDialog session={session} />
    </Stack>
  );
}
