import { MicrophoneSlash } from "@phosphor-icons/react";
import {
  Button,
  Cluster,
  EmptyState,
  ErrorState,
  Heading,
  LiveBar,
  Notice,
  Stack,
  Text,
  VoiceOrb,
} from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useRealtimeCall } from "../../lib/call";
import { voiceMinutesQuery } from "../../lib/queries";
import { minutesLeft, resetsIn, useCallClock } from "../../lib/voiceMinutes";
import {
  characters,
  coachIntro,
  RoleplayEnding,
  roleplayLabel,
  type Roleplay,
  type RoleplayKind,
  type useRoleplayEnd,
} from "./roleplay";

export type VoiceRoleplayProps = {
  roleplay: Roleplay;
  session: ReturnType<typeof useRoleplayEnd>;
  onTypeInstead?: () => void;
};

type Call = ReturnType<typeof useRealtimeCall>;

const WARN_MS = 60_000;

const orbLabels = (who: string) => ({
  connecting: "Connecting…",
  ready: `Your ${who} is listening`,
  listening: "Listening to you…",
  thinking: "Thinking…",
  speaking: `Your ${who} is speaking`,
});

/** Known before the call: with no minutes left, don't ask for the microphone at all. Checked once, so the call isn't swapped out when its polled minutes reach 0. */
export function VoiceRoleplay(props: VoiceRoleplayProps) {
  const minutes = useQuery(voiceMinutesQuery);
  const [capped] = useState(() => minutes.data?.remainingSeconds === 0);
  if (!capped) return <VoiceCall {...props} />;
  if (props.session.ending !== "running") return <RoleplayEnding {...props.session} />;
  return <Capped limitMinutes={minutes.data?.limitMinutes} {...props} />;
}

function Capped({ limitMinutes, session, onTypeInstead }: VoiceRoleplayProps & { limitMinutes?: number }) {
  // In the browser only: the server's clock may be in another timezone.
  const [when, setWhen] = useState<string>();
  useEffect(() => setWhen(resetsIn(new Date())), []);
  const limit = limitMinutes === undefined ? "" : `Voice Roleplays get ${limitMinutes} minutes a day. `;
  const next = onTypeInstead
    ? "You can type this Roleplay instead."
    : "What you said is saved, so you can get your Debrief now.";
  const action = onTypeInstead ? (
    <Button onClick={onTypeInstead}>Type instead</Button>
  ) : (
    <Button onClick={() => void session.end()}>Get my Debrief</Button>
  );
  return (
    <EmptyState
      icon={MicrophoneSlash}
      title="You've used today's voice minutes"
      description={`${limit}More are available at midnight${when ? `, ${when}` : ""}. ${next}`}
      action={action}
    />
  );
}

function CallOver({ over, session }: { over?: "timesUp" | "dropped"; session: VoiceRoleplayProps["session"] }) {
  return (
    <Stack gap={6}>
      {over === "timesUp" && (
        <Notice tone="info">You've used today's voice minutes, so the Roleplay ended there.</Notice>
      )}
      {over === "dropped" && <Notice tone="info">Your call dropped, so the Roleplay ended there.</Notice>}
      <RoleplayEnding {...session} />
    </Stack>
  );
}

function CallProblem({
  microphone,
  response,
  retry,
  typeInstead,
  props,
}: {
  microphone: boolean;
  response?: { status: number; body: unknown } | null;
  retry: () => void;
  typeInstead: ReactNode;
  props: VoiceRoleplayProps;
}) {
  const status = response?.status;
  if (microphone)
    return (
      <ErrorState
        title="Allow your microphone"
        description="A voice Roleplay needs your microphone. Allow it for Fluently in your browser's site settings, or connect one, then try again."
        onRetry={retry}
        action={typeInstead}
      />
    );
  if (status === 429) {
    const limitMinutes = (response?.body as { limitMinutes?: number } | null)?.limitMinutes;
    return <Capped limitMinutes={limitMinutes} {...props} />;
  }
  if (status === 409)
    return (
      <ErrorState
        title="You're already in a voice call"
        description="You can have one live call at a time. End the call in your other tab or window, then try again. A call that was cut off clears within a minute."
        onRetry={retry}
        action={typeInstead}
      />
    );
  return (
    <ErrorState
      title="We couldn't connect your call"
      description="Check your connection and try again."
      onRetry={retry}
      action={typeInstead}
    />
  );
}

function LiveCall({
  roleplay,
  call,
  active,
  clock,
  left,
  onEnd,
}: {
  roleplay: Roleplay;
  call: Call;
  active: boolean;
  clock: ReturnType<typeof useCallClock>;
  left?: number;
  onEnd: () => void;
}) {
  const kind = roleplay.roleplayKind as RoleplayKind;
  const who = characters[kind].toLowerCase();
  const phase = active ? call.conversation.phase : "connecting";
  const wrappingUp = left !== undefined && left <= WARN_MS;
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
        onEnd={onEnd}
      />
      {wrappingUp && (
        <Notice tone="info">{`About a minute of voice time is left today. Your ${who} will start to wrap up.`}</Notice>
      )}
      <Stack gap={3}>
        <Heading level={1} size="title">
          {`Talk with your ${who}`}
        </Heading>
        {roleplay.roleplayScenario && <Text tone="muted">{roleplay.roleplayScenario}</Text>}
        <Text>{coachIntro(kind)}</Text>
      </Stack>
      <Cluster justify="center">
        <VoiceOrb phase={phase} label={orbLabels(who)[phase]} />
      </Cluster>
    </Stack>
  );
}

function VoiceCall(props: VoiceRoleplayProps) {
  const { roleplay, session, onTypeInstead } = props;
  const [over, setOver] = useState<"timesUp" | "dropped">();
  const running = session.ending === "running";
  const call = useRealtimeCall(`/api/roleplays/${roleplay.id}/call`, {
    // The API can't rejoin a call, so a dropped one ends the Roleplay with what was said so far. At the cap, the
    onDropped: () => finish(left !== undefined && left <= 5_000 ? "timesUp" : "dropped"),
  });
  const active = running && (call.status === "live" || call.status === "reconnecting");
  const clock = useCallClock(active);
  // The server is the judge of the cap; polling keeps the countdown honest between ticks.
  const minutes = useQuery({ ...voiceMinutesQuery, refetchInterval: active ? 15_000 : false });
  const left =
    minutes.data &&
    minutesLeft(
      { remainingSeconds: minutes.data.remainingSeconds, fetchedAt: minutes.dataUpdatedAt },
      clock.since,
      clock.now,
    );

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

  if (!running) return <CallOver over={over} session={session} />;
  if (call.status === "microphone" || call.status === "failed") {
    const typeInstead = onTypeInstead && <Button onClick={onTypeInstead}>Type instead</Button>;
    return (
      <CallProblem
        microphone={call.status === "microphone"}
        response={call.status === "failed" ? call.response : undefined}
        retry={call.retry}
        typeInstead={typeInstead}
        props={props}
      />
    );
  }
  return (
    <LiveCall
      roleplay={roleplay}
      call={call}
      active={active}
      clock={clock}
      left={left}
      onEnd={() => void session.end()}
    />
  );
}
