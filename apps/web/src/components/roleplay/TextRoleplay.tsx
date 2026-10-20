import { useChat } from "@ai-sdk/react";
import { Button, ChatComposer, ChatThread, ChatTurn, ChatWriting, Notice, Stack, Text } from "@fluently/ui";
import type { UIMessage } from "ai";
import { useState } from "react";
import { chatOptions } from "../../lib/chat";
import { characters, coachIntro, RoleplayBar, type Roleplay, type RoleplayKind } from "./roleplay";

function SendError({ onRetry }: { onRetry: () => void }) {
  return (
    <Stack gap={3} align="start">
      <Notice tone="error">We couldn't send that. Check your connection and try again.</Notice>
      <Button variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    </Stack>
  );
}

export function TextRoleplay({ roleplay, onEnd }: { roleplay: Roleplay; onEnd: () => void }) {
  const kind = roleplay.roleplayKind as RoleplayKind;
  const { messages, sendMessage, regenerate, status, error } = useChat({
    id: roleplay.id,
    ...chatOptions(`/api/roleplays/${roleplay.id}/chat`, roleplay.messages as unknown as UIMessage[]),
  });
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";

  // The coach may still be opening its turn (or its first token hasn't arrived), so show the skeleton bubble.
  const last = messages.at(-1);
  const latestText =
    last?.role === "assistant" ? last.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("") : "";
  const waiting = status === "submitted" || (status === "streaming" && !latestText);
  const streamingId = status === "streaming" && last?.role === "assistant" && latestText ? last.id : undefined;
  const lastTextIndex = last ? last.parts.reduce((at, part, i) => (part.type === "text" ? i : at), -1) : -1;

  function send() {
    const text = draft.trim();
    if (!text || busy) return;
    void sendMessage({ text });
    setDraft("");
  }

  const turns = messages.flatMap((message) =>
    message.parts.map((part, i) =>
      part.type === "text" && part.text ? (
        <ChatTurn
          key={`${message.id}-${i}`}
          from={message.role === "user" ? "learner" : "coach"}
          name={message.role === "user" ? undefined : characters[kind]}
          streaming={message.id === streamingId && i === lastTextIndex}
        >
          {part.text}
        </ChatTurn>
      ) : null,
    ),
  );
  const thread = (messages.length > 0 || waiting) && (
    <ChatThread label={`Conversation with your ${characters[kind].toLowerCase()}`} busy={busy}>
      {turns}
      {waiting && <ChatWriting name={characters[kind]} />}
    </ChatThread>
  );

  return (
    <Stack gap={6}>
      {/* Ending mid-reply would leave that turn out of the Debrief. */}
      <RoleplayBar roleplay={roleplay} onEnd={onEnd} disabled={busy} />
      {roleplay.roleplayScenario && <Text tone="muted">{roleplay.roleplayScenario}</Text>}
      {messages.length === 0 && <Text tone="muted">{coachIntro(kind)}</Text>}
      {thread}
      {error && <SendError onRetry={() => void regenerate()} />}
      <ChatComposer
        label="Your reply"
        value={draft}
        onValueChange={setDraft}
        onSend={send}
        pending={status === "submitted"}
        disabled={busy}
        maxLength={2000}
        placeholder={`Reply to your ${characters[kind].toLowerCase()}…`}
      />
    </Stack>
  );
}
