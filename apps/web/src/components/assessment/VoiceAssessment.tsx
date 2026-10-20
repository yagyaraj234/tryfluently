import { CoachCall, ErrorState, Notice, Stack } from "@impromptu/ui";
import { useEffect, useState } from "react";
import { useRealtimeCall } from "../../lib/call";
import { AssessmentEnding, LeaveDialog, TimeLeft, useAssessmentSession, type Assessment } from "./assessment";

type Call = ReturnType<typeof useRealtimeCall>;
type Session = ReturnType<typeof useAssessmentSession>;

function CallScreen({ call, session }: { call: Call; session: Session }) {
  if (call.status === "microphone")
    return (
      <ErrorState
        title="Allow your microphone"
        description="The Voice Assessment needs your microphone. Allow it for Impromptu in your browser's site settings, or connect one, then try again."
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
      <TimeLeft left={session.left} />
    </CoachCall>
  );
}

export function VoiceAssessment({ assessment }: { assessment: Assessment }) {
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

  return (
    <>
      <CallScreen call={call} session={session} />
      <LeaveDialog session={session} />
    </>
  );
}
