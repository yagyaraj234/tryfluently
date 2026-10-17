import { Button, Cluster, Dialog, EmptyState, ErrorState, LoadingState, Text } from "@impromptu/ui";
import { Link, useBlocker, useRouter } from "@tanstack/react-router";
import type { InferResponseType } from "hono/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

// What the Written and Voice Assessments share: the 10-minute clock, ending through /end, leaving early,
// and the screens shown while the Report is written.

type Client = ReturnType<typeof api>["api"]["assessments"][":id"];
export type Assessment = InferResponseType<Client["$get"], 200>;
export type Report = Extract<InferResponseType<Client["end"]["$post"], 200>, { status: "completed" }>["report"];

export const LIMIT_MS = 10 * 60_000;
const MIN_MS = 4 * 60_000;

/** "9:05" */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Milliseconds left of the 10 minutes, ticking each second; undefined until it runs in the browser. */
function useTimeLeft(startedAt: string) {
  const [left, setLeft] = useState<number>();
  useEffect(() => {
    const tick = () => setLeft(new Date(startedAt).getTime() + LIMIT_MS - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  return left;
}

export type Ending = "running" | "ending" | "failed" | "discarded";

/**
 * Runs an Assessment in progress. At 10:00, or on `finish()`, it calls /end; then it goes to the Report, or shows
 * that a short attempt was discarded. Navigating away mid-way asks first, and ends with `left: true` (a partial Report).
 */
export function useAssessmentSession(assessment: Assessment) {
  const router = useRouter();
  const left = useTimeLeft(assessment.startedAt);
  const [ending, setEnding] = useState<Ending>("running");
  const leftEarly = useRef(false);
  // A ref, not state, so the blocker lets the navigation to the Report through straight away.
  const running = useRef(true);

  const end = useCallback(async () => {
    running.current = false;
    setEnding("ending");
    try {
      const response = await api().api.assessments[":id"].end.$post({ param: { id: assessment.id }, json: { left: leftEarly.current } });
      // Already ended (another tab, or the server wrapped it up): reload to show where it got to.
      if ((response.status as number) === 409) return void (await router.invalidate());
      if (!response.ok) return setEnding("failed");
      const body = await response.json();
      if (body.status === "discarded") return setEnding("discarded");
      await router.navigate({ to: "/assessments/$assessmentId/report", params: { assessmentId: assessment.id } });
    } catch {
      setEnding("failed");
    }
  }, [assessment.id, router]);

  const timeUp = left !== undefined && left <= 0;
  useEffect(() => {
    if (timeUp && ending === "running") void end();
  }, [timeUp, ending, end]);

  const blocker = useBlocker({ shouldBlockFn: () => running.current, enableBeforeUnload: () => running.current, withResolver: true });

  return {
    /** Milliseconds left, once the clock runs. */
    left,
    ending,
    /** The Learner is done (or the call ended): end now and see the Report. */
    finish: end,
    /** Try /end again after it failed (a 502 means the Report couldn't be written). */
    retry: end,
    /** Shown when the Learner tries to leave mid-way. */
    leaving: {
      open: blocker.status === "blocked",
      short: left !== undefined && LIMIT_MS - left < MIN_MS,
      stay: () => blocker.reset?.(),
      leave: () => {
        blocker.reset?.();
        leftEarly.current = true;
        void end();
      },
    },
  };
}

type Session = ReturnType<typeof useAssessmentSession>;

/** The time left, for the top of the Assessment screen. */
export function TimeLeft({ left }: { left?: number }) {
  if (left === undefined) return null;
  return (
    <Text tabular tone="muted" as="span">
      {clock(left)} left
    </Text>
  );
}

/** What the Learner sees once the Assessment is ending: the wait for the Report, a retry, or a discarded attempt. */
export function AssessmentEnding({ session }: { session: Session }) {
  if (session.ending === "discarded") return <Discarded />;
  if (session.ending === "failed")
    return (
      <ErrorState
        title="We couldn't write your Report"
        description="Your answers are saved. Try again in a moment."
        onRetry={() => void session.retry()}
        retryLabel="Write my Report"
      />
    );
  return <LoadingState title="Writing your Assessment Report…" description="Your coach is reading your answers. This takes up to a minute." />;
}

export function Discarded() {
  return (
    <EmptyState
      title="Attempt discarded"
      description="An Assessment needs at least 4 minutes to count, so this one wasn't saved. You can start again now."
      action={<Button render={<Link to="/assessments/new" />}>Start again</Button>}
    />
  );
}

/** Asks before leaving mid-way. */
export function LeaveDialog({ session }: { session: Session }) {
  const { leaving } = session;
  return (
    <Dialog
      open={leaving.open}
      onOpenChange={(open) => !open && leaving.stay()}
      title="Leave the Assessment?"
      description={
        leaving.short
          ? "You've been going for under 4 minutes, so this attempt won't count."
          : "You'll get a partial Report, based on what you've answered so far."
      }
    >
      <Cluster gap={3} justify="end">
        <Button variant="secondary" onClick={leaving.stay}>
          Keep going
        </Button>
        <Button onClick={leaving.leave}>Leave now</Button>
      </Cluster>
    </Dialog>
  );
}
