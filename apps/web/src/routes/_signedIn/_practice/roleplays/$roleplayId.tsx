import { useChat } from "@ai-sdk/react";
import { Button, ChatTurn, Cluster, Debrief, EmptyState, ErrorState, Heading, LiveBar, Notice, Spinner, Stack, Text, TextArea, VoiceOrb } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { useEffect, useState, type FormEvent } from "react";
import { useRealtimeCall } from "../../../../lib/call";
import { chatOptions } from "../../../../lib/chat";
import { useNextLesson } from "../../../../lib/lessons";
import { voiceMinutesQuery } from "../../../../lib/queries";
import { minutesLeft, resetsIn, useCallClock } from "../../../../lib/voiceMinutes";
import {
  characters,
  fetchRoleplay,
  hear,
  RoleplayBar,
  RoleplayEnding,
  roleplayKinds,
  roleplayLabel,
  useRoleplayEnd,
  type DebriefData,
  type Roleplay,
  type RoleplayKind,
} from "../../../../components/roleplay/roleplay";

/** One screen for a Roleplay from setup or one that closes a Unit: playing it, in text or by voice, then its Debrief. */
export const Route = createFileRoute("/_signedIn/_practice/roleplays/$roleplayId")({
  loader: { staleReloadMode: "blocking", handler: async ({ params, context }) => {
    const roleplay = await fetchRoleplay(params.roleplayId);
    // A spoken Roleplay shows today's voice minutes from the first paint (and the cap, without asking for the microphone).
    if (roleplay?.status === "in_progress" && !roleplay.textMode) await context.queryClient.prefetchQuery(voiceMinutesQuery);
    return roleplay;
  } },
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
// The mode seam: a text Roleplay is a chat, a spoken one a live call.

function InProgress({ roleplay }: { roleplay: Roleplay }) {
  // A Roleplay not yet spoken in can still be typed instead (the first message switches it to text on the server).
  const [typing, setTyping] = useState(false);
  const session = useRoleplayEnd(roleplay.id);
  if (roleplay.textMode || typing)
    return session.ending === "running" ? <TextRoleplay roleplay={roleplay} onEnd={() => void session.end()} /> : <RoleplayEnding {...session} />;
  const spoken = (roleplay.messages as unknown[]).length > 0;
  return <VoiceRoleplay roleplay={roleplay} session={session} onTypeInstead={spoken ? undefined : () => setTyping(true)} />;
}

type VoiceProps = {
  roleplay: Roleplay;
  session: ReturnType<typeof useRoleplayEnd>;
  /** Only while nothing has been spoken, and only offered while no call is live (it can't be taken back). */
  onTypeInstead?: () => void;
};

// Known before the call: with no minutes left, don't ask for the microphone at all. Checked once, so the call itself
// isn't swapped out when its polled minutes reach 0 (the call ends then instead).
function VoiceRoleplay(props: VoiceProps) {
  const minutes = useQuery(voiceMinutesQuery);
  const [capped] = useState(() => minutes.data?.remainingSeconds === 0);
  if (!capped) return <VoiceCall {...props} />;
  if (props.session.ending !== "running") return <RoleplayEnding {...props.session} />;
  return <Capped limitMinutes={minutes.data?.limitMinutes} {...props} />;
}

/** Today's voice minutes are used up: they're back at midnight. Until then, type, or end for the Debrief. */
function Capped({ limitMinutes, session, onTypeInstead }: VoiceProps & { limitMinutes?: number }) {
  // In the browser only: the server's clock may be in another timezone.
  const [when, setWhen] = useState<string>();
  useEffect(() => setWhen(resetsIn(new Date())), []);
  const limit = limitMinutes === undefined ? "" : `Voice Roleplays get ${limitMinutes} minutes a day. `;
  return (
    <EmptyState
      title="You've used today's voice minutes"
      description={`${limit}They're back at midnight${when ? `, ${when}` : ""}. ${
        onTypeInstead ? "You can type this Roleplay instead." : "What you said is saved, so you can get your Debrief now."
      }`}
      action={
        onTypeInstead ? <Button onClick={onTypeInstead}>Type instead</Button> : <Button onClick={() => void session.end()}>Get my Debrief</Button>
      }
    />
  );
}

const WARN_MS = 60_000;

const orbLabels = (who: string) => ({
  connecting: "Connecting…",
  ready: `Your ${who} is listening`,
  listening: "Listening to you…",
  thinking: "Thinking…",
  speaking: `Your ${who} is speaking`,
});

// A live call in character. Ending it (End, today's minutes running out, or a dropped call) goes through /end, which
// hangs it up on the server and writes the Debrief.
function VoiceCall({ roleplay, session, onTypeInstead }: VoiceProps) {
  const [over, setOver] = useState<"timesUp" | "dropped">();
  const running = session.ending === "running";
  const call = useRealtimeCall(`/api/roleplays/${roleplay.id}/call`, {
    // The API can't rejoin a call, so a dropped one ends the Roleplay with what was said so far. At the cap, the
    // server hung up on purpose.
    onDropped: () => finish(left !== undefined && left <= 5_000 ? "timesUp" : "dropped"),
  });
  const active = running && (call.status === "live" || call.status === "reconnecting");
  const clock = useCallClock(active);
  // The server is the judge of the cap; polling keeps the countdown honest between ticks.
  const minutes = useQuery({ ...voiceMinutesQuery, refetchInterval: active ? 15_000 : false });
  const left = minutes.data && minutesLeft({ remainingSeconds: minutes.data.remainingSeconds, fetchedAt: minutes.dataUpdatedAt }, clock.since, clock.now);

  function finish(reason: "timesUp" | "dropped") {
    if (!running) return;
    setOver(reason);
    void session.end();
  }

  const timesUp = active && left !== undefined && left <= 0;
  useEffect(() => {
    if (timesUp) finish("timesUp");
  });

  // Mute while /end hangs up the call and writes the Debrief; let go of the call once that's done.
  const { mute, hangUp } = call;
  useEffect(() => {
    if (session.ending === "ending") mute(true);
    else if (session.ending !== "running") hangUp();
  }, [session.ending, mute, hangUp]);

  if (!running)
    return (
      <Stack gap={6}>
        {over === "timesUp" && <Notice tone="info">Time's up for today: you've used today's voice minutes, so the Roleplay ended there.</Notice>}
        {over === "dropped" && <Notice tone="info">Your call dropped, so the Roleplay ended there.</Notice>}
        <RoleplayEnding {...session} />
      </Stack>
    );

  const typeInstead = onTypeInstead && <Button onClick={onTypeInstead}>Type instead</Button>;
  if (call.status === "microphone")
    return (
      <ErrorState
        title="Allow your microphone"
        description="A voice Roleplay needs your microphone. Allow it for Impromptu in your browser's site settings, or connect one, then try again."
        onRetry={call.retry}
        action={typeInstead}
      />
    );
  if (call.status === "failed") {
    const { status, body } = call.response ?? {};
    if (status === 429) {
      const limitMinutes = (body as { limitMinutes?: number } | null)?.limitMinutes;
      return <Capped limitMinutes={limitMinutes} roleplay={roleplay} session={session} onTypeInstead={onTypeInstead} />;
    }
    if (status === 409)
      return (
        <ErrorState
          title="You're already in a voice call"
          description="You can have one live call at a time. End the call in your other tab or window, then try again. A call that was cut off clears within a minute."
          onRetry={call.retry}
          action={typeInstead}
        />
      );
    return <ErrorState title="We couldn't connect your call" description="Check your connection and try again." onRetry={call.retry} action={typeInstead} />;
  }

  const kind = roleplay.roleplayKind as RoleplayKind;
  return (
    <Stack gap={6}>
      <LiveBar
        state={active ? (call.status as "live" | "reconnecting") : "connecting"}
        title={roleplayLabel(roleplay)}
        elapsed={clock.since === undefined ? undefined : clock.now - clock.since}
        left={left}
        leftLabel="left today"
        muted={call.muted}
        onMutedChange={call.mute}
        onEnd={() => void session.end()}
      />
      {left !== undefined && left <= WARN_MS && (
        <Notice tone="info">{`About a minute of voice time is left today. Your ${characters[kind].toLowerCase()} will start to wrap up.`}</Notice>
      )}
      <Stack gap={3}>
        <Heading level={1} size="title">
          {`Talk with your ${characters[kind].toLowerCase()}`}
        </Heading>
        <Text>{`Say hello to start. Your ${characters[kind].toLowerCase()} stays in character until you end the ${roleplayKinds[kind]}, and your Debrief comes at the end.`}</Text>
      </Stack>
      <Cluster justify="center">
        <VoiceOrb phase={active ? call.conversation.phase : "connecting"} label={orbLabels(characters[kind].toLowerCase())[active ? call.conversation.phase : "connecting"]} />
      </Cluster>
    </Stack>
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
