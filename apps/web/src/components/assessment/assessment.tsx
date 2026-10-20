import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { Button, Cluster, Dialog, EmptyState, ErrorState, LoadingState, Text } from "@fluently/ui";
import { Link, useBlocker, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type Client = ReturnType<typeof api>["api"]["assessments"][":id"];
export type Assessment = InferResponseType<Client["$get"], 200>;
export type Report = Extract<InferResponseType<Client["end"]["$post"], 200>, { status: "completed" }>["report"];

export const LIMIT_MS = 10 * 60_000;
const MIN_MS = 4 * 60_000;
/** A Written Assessment has no clock; it ends after this many answers (the API asks the coach to close then). */
export const MAX_ANSWERS = 12;

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

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

/** `timed` is false for a Written Assessment: no countdown and no time-up. */
export function useAssessmentSession(assessment: Assessment, timed = true) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const remaining = useTimeLeft(assessment.startedAt);
  const left = timed ? remaining : undefined;
  const [ending, setEnding] = useState<Ending>("running");
  const leftEarly = useRef(false);
  // A ref, not state, so the blocker lets the navigation to the Report through straight away.
  const running = useRef(true);

  const end = useCallback(async () => {
    running.current = false;
    setEnding("ending");
    try {
      const response = await api().api.assessments[":id"].end.$post({
        param: { id: assessment.id },
        json: { left: leftEarly.current },
      });
      // Already ended (another tab, or the server wrapped it up): reload to show where it got to.
      if ((response.status as number) === 409) return void (await router.invalidate());
      if (!response.ok) return setEnding("failed");
      const body = await response.json();
      if (body.status === "discarded") return setEnding("discarded");
      void queryClient.invalidateQueries();
      await router.navigate({ to: "/assessments/$assessmentId/report", params: { assessmentId: assessment.id } });
    } catch {
      setEnding("failed");
    }
  }, [assessment.id, router, queryClient]);

  const timeUp = left !== undefined && left <= 0;
  useEffect(() => {
    if (timeUp && ending === "running") void end();
  }, [timeUp, ending, end]);

  const blocker = useBlocker({
    shouldBlockFn: () => running.current,
    enableBeforeUnload: () => running.current,
    withResolver: true,
  });

  return {
    left,
    ending,
    finish: end,
    /** Try /end again after it failed (a 502 means the Report couldn't be written). */
    retry: end,
    leaving: {
      open: blocker.status === "blocked",
      short: remaining !== undefined && LIMIT_MS - remaining < MIN_MS,
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

export function TimeLeft({ left }: { left?: number }) {
  if (left === undefined) return null;
  return (
    <Text tabular tone="muted" as="span">
      {clock(left)} left
    </Text>
  );
}

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
  return (
    <LoadingState
      title="Writing your Assessment Report…"
      description="Your coach is reading your answers. This takes up to a minute."
    />
  );
}

export function Discarded() {
  return (
    <EmptyState
      icon={ArrowCounterClockwise}
      title="Attempt discarded"
      description="An Assessment needs at least 4 minutes to count, so this one wasn't saved. You can start again now."
      action={<Button render={<Link to="/assessments/new" />}>Start again</Button>}
    />
  );
}

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
