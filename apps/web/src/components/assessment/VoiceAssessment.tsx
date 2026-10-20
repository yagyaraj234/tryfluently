import { CoachCall, ErrorState, Notice, Stack, TextLink } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { VoiceAccess, VoiceLimit, BetaVoiceCredits } from "../voice/VoiceCredits";
import { voiceMinutesQuery } from "../../lib/queries";
import { minutesLeft, useCallClock } from "../../lib/voiceMinutes";
import { useEffect, useState } from "react";
import { useRealtimeCall } from "../../lib/call";
import { AssessmentEnding, LeaveDialog, TimeLeft, useAssessmentSession, type Assessment } from "./assessment";

type Call = ReturnType<typeof useRealtimeCall>;
type Session = ReturnType<typeof useAssessmentSession>;

function WrittenAlternative() {
  return <TextLink render={<Link to="/assessments/new" />}>Choose Written Assessment</TextLink>;
}

function CallScreen({ call, session, left }: { call: Call; session: Session; left?: number }) {
  if (call.status === "failed" && call.response?.status === 429)
    return <VoiceLimit budget={call.response.body as { resetsAt?: string }} action={<WrittenAlternative />} />;
  if (call.status === "microphone")
    return (
      <ErrorState
        title="Allow your microphone"
        description="The Voice Assessment needs your microphone. Allow it for Fluently in your browser's site settings, or connect one, then try again."
        onRetry={call.retry}
      />
    );
  if (call.status === "failed" && call.response?.status === 409)
    return (
      <ErrorState
        title="You're already in a voice call"
        description="You can have one live call at a time. End the call in your other tab or window, then try again. A call that was cut off clears within a minute."
        onRetry={call.retry}
      />
    );
  if (call.status === "failed")
    return (
      <ErrorState
        title="We couldn't connect your call"
        description="Check your connection and try again."
        onRetry={call.retry}
      />
    );
  return (
    <CoachCall
      connection={call.status === "live" || call.status === "reconnecting" ? call.status : "connecting"}
      state={call.status === "live" ? call.conversation.phase : "ready"}
      caption={call.conversation.caption}
      speaker={call.conversation.speaker}
      muted={call.muted}
      onMutedChange={call.mute}
      onEnd={() => void session.finish()}
    >
      <TimeLeft left={left} />
    </CoachCall>
  );
}

export function VoiceAssessment({ assessment }: { assessment: Assessment }) {
  return (
    <VoiceAccess capped={<VoiceLimit action={<WrittenAlternative />} />}>
      <VoiceAssessmentCall assessment={assessment} />
    </VoiceAccess>
  );
}

function VoiceAssessmentCall({ assessment }: { assessment: Assessment }) {
  const session = useAssessmentSession(assessment);
  const [over, setOver] = useState<"dropped" | "timesUp">();
  const running = session.ending === "running";
  const call = useRealtimeCall(`/api/assessments/${assessment.id}/call`, {
    // The API can't rejoin a call, so a dropped one ends the Assessment with what was said so far.
    onDropped: () => {
      if (!running) return;
      setOver(left !== undefined && left <= 5_000 ? "timesUp" : "dropped");
      void session.finish();
    },
  });

  const active = running && (call.status === "live" || call.status === "reconnecting");
  const clock = useCallClock(active);
  const minutes = useQuery({ ...voiceMinutesQuery, refetchInterval: active ? 15_000 : false });
  const budgetLeft =
    minutes.data && minutesLeft({ ...minutes.data, fetchedAt: minutes.dataUpdatedAt }, clock.since, clock.now);
  const left = budgetLeft === undefined ? session.left : Math.min(budgetLeft, session.left ?? Infinity);
  const timesUp = active && budgetLeft !== undefined && budgetLeft <= 0;
  useEffect(() => {
    if (timesUp) {
      setOver("timesUp");
      void session.finish();
    }
  }, [timesUp, session.finish]);

  // Mute while /end hangs up the call and writes the Report; let go of the call once that's done.
  const { mute, hangUp } = call;
  useEffect(() => {
    if (session.ending === "ending") mute(true);
    else if (session.ending !== "running") hangUp();
  }, [session.ending, mute, hangUp]);

  if (!running)
    return (
      <Stack gap={6}>
        {over === "dropped" && <Notice tone="info">Your call dropped, so the Assessment ended there.</Notice>}
        {over === "timesUp" && (
          <>
            <Notice tone="info">Your voice time ran out, so the Assessment ended there.</Notice>
            <BetaVoiceCredits />
          </>
        )}
        <AssessmentEnding session={session} />
      </Stack>
    );

  return (
    <>
      {active && budgetLeft !== undefined && budgetLeft <= 60_000 && (
        <Notice tone="info">About a minute of voice time is left. Your coach will start to wrap up.</Notice>
      )}
      <CallScreen call={call} session={session} left={left} />
      <LeaveDialog session={session} />
    </>
  );
}
