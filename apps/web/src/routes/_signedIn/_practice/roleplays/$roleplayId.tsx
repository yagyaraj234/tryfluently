import { useChat } from "@ai-sdk/react";
import { Button, ChatTurn, Debrief, EmptyState, ErrorState, Notice, Spinner, Stack, Text, TextArea } from "@impromptu/ui";
import { createFileRoute, Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { useState, type FormEvent } from "react";
import { chatOptions } from "../../../../chat";
import { useNextLesson } from "../../../../lessons";
import {
  characters,
  fetchRoleplay,
  hear,
  RoleplayBar,
  RoleplayEnding,
  roleplayKinds,
  useRoleplayEnd,
  type DebriefData,
  type Roleplay,
  type RoleplayKind,
} from "../../../../roleplay";

/** One screen for a Roleplay from setup or one that closes a Unit: playing it, in text or by voice, then its Debrief. */
export const Route = createFileRoute("/_signedIn/_practice/roleplays/$roleplayId")({
  loader: ({ params }) => fetchRoleplay(params.roleplayId),
  component: RoleplayScreen,
  errorComponent: RoleplayError,
});

function RoleplayError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const description = error instanceof Error ? error.message : undefined;
  return <ErrorState title="Your Roleplay couldn't be loaded" description={description} onRetry={() => router.invalidate()} />;
}

function RoleplayScreen() {
  const roleplay = Route.useLoaderData();
  if (!roleplay) return <EmptyState title="We couldn't find that Roleplay" description="It may belong to another account." />;
  if (roleplay.status === "completed") return <DebriefScreen roleplay={roleplay} />;
  if (roleplay.status === "abandoned") return <Abandoned />;
  return <InProgress key={roleplay.id} roleplay={roleplay} />;
}

// ---- Playing it ------------------------------------------------------------------------------------------------
// The mode seam: a text Roleplay is a chat here; #95 replaces VoiceRoleplay with the live call.

function InProgress({ roleplay }: { roleplay: Roleplay }) {
  // A Roleplay not yet spoken in can still be typed instead (the first message switches it to text on the server).
  const [typing, setTyping] = useState(false);
  const session = useRoleplayEnd(roleplay.id);
  if (session.ending !== "running") return <RoleplayEnding {...session} />;
  if (roleplay.textMode || typing) return <TextRoleplay roleplay={roleplay} onEnd={() => void session.end()} />;
  const spoken = (roleplay.messages as unknown[]).length > 0;
  return <VoiceRoleplay onTypeInstead={spoken ? undefined : () => setTyping(true)} />;
}

// A placeholder until #95 builds the live call, with the LiveBar, useRoleplayEnd and RoleplayEnding.
function VoiceRoleplay({ onTypeInstead }: { onTypeInstead?: () => void }) {
  return (
    <EmptyState
      title="Voice Roleplays are coming soon"
      description="For now, you can play this Roleplay by typing."
      action={onTypeInstead && <Button onClick={onTypeInstead}>Type instead</Button>}
    />
  );
}

function TextRoleplay({ roleplay, onEnd }: { roleplay: Roleplay; onEnd: () => void }) {
  const kind = roleplay.roleplayKind as RoleplayKind;
  const { messages, sendMessage, regenerate, status, error } = useChat({
    id: roleplay.id,
    ...chatOptions(`/api/roleplays/${roleplay.id}/chat`, roleplay.messages as unknown as UIMessage[]),
  });
  const [draft, setDraft] = useState("");
  const busy = status === "submitted" || status === "streaming";

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    void sendMessage({ text: draft.trim() });
    setDraft("");
  }

  return (
    <Stack gap={6}>
      {/* Ending mid-reply would leave that turn out of the Debrief. */}
      <RoleplayBar roleplay={roleplay} onEnd={onEnd} disabled={busy} />
      {messages.length === 0 && (
        <Text tone="muted">{`Your ${characters[kind].toLowerCase()} is ready and will stay in character until you end the ${roleplayKinds[kind]}. Say hello to start. Your Debrief comes at the end.`}</Text>
      )}
      <Stack gap={5}>
        {messages.flatMap((message) =>
          message.parts.map((part, i) =>
            part.type === "text" ? (
              <ChatTurn
                key={`${message.id}-${i}`}
                from={message.role === "user" ? "learner" : "coach"}
                name={message.role === "user" ? undefined : characters[kind]}
              >
                {part.text}
              </ChatTurn>
            ) : null,
          ),
        )}
        {status === "submitted" && <Spinner label={`The ${characters[kind].toLowerCase()} is writing`} />}
      </Stack>
      {error && (
        <Stack gap={3} align="start">
          <Notice tone="error">We couldn't send that. Check your connection and try again.</Notice>
          <Button variant="secondary" onClick={() => void regenerate()}>
            Try again
          </Button>
        </Stack>
      )}
      <form onSubmit={send}>
        <Stack gap={3}>
          <TextArea label="Your reply" value={draft} onValueChange={setDraft} rows={3} maxLength={2000} />
          <Button type="submit" disabled={busy || !draft.trim()}>
            Send
          </Button>
        </Stack>
      </form>
    </Stack>
  );
}

// ---- After it --------------------------------------------------------------------------------------------------

function Abandoned() {
  return (
    <EmptyState
      title="Roleplay abandoned"
      description="It ended before you said anything, so there's no Debrief. Start another whenever you're ready."
      action={<Button render={<Link to="/roleplays/new" />}>Start a Roleplay</Button>}
    />
  );
}

function DebriefScreen({ roleplay }: { roleplay: Roleplay }) {
  const next = useNextLesson();
  const debrief = roleplay.debrief as unknown as DebriefData;
  return (
    <Stack gap={4}>
      <Debrief
        {...debrief}
        onHear={hear}
        actions={
          <>
            {/* A Roleplay that closes a Unit carries on along the Roadmap; one from setup can be played again. */}
            {roleplay.unitId ? (
              <Button onClick={() => next.mutate()} disabled={next.isPending || next.isSuccess}>
                Next Lesson
              </Button>
            ) : (
              <Button render={<Link to="/roleplays/new" />}>Another Roleplay</Button>
            )}
            <Button variant="secondary" render={<Link to="/" />}>
              Back to Home
            </Button>
          </>
        }
      />
      {next.isError && <Text tone="muted">Your next Lesson couldn't be prepared. Try again in a moment.</Text>}
    </Stack>
  );
}
