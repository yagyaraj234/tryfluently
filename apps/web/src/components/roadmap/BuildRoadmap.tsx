import { Button, EmptyState, ErrorState, Heading, LoadingState, Stack, Text } from "@impromptu/ui";
import { MapTrifold } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../lib/api";
import { lessonRoute } from "../../lib/lessons";
import { practicePreparationQuery, usePracticePreparation } from "../../lib/practice-preparation";

// compact: left-aligned like the neighbouring Home cards, instead of a centered page-level state.
export function BuildRoadmap({ compact }: { compact?: boolean }) {
  const preparation = usePracticePreparation();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: async () => {
      const response = await api().api.assessments.preparation.$post();
      if (!response.ok) throw new Error("We couldn't prepare your practice. Try again.");
      await queryClient.invalidateQueries(practicePreparationQuery);
    },
  });

  if (preparation.isError)
    return (
      <ErrorState
        title="We couldn't check your practice"
        description="Your Assessment Report is saved."
        onRetry={() => void preparation.refetch()}
      />
    );
  if (retry.isError)
    return (
      <ErrorState
        title="We couldn't prepare your practice"
        description="Your Assessment Report is saved."
        onRetry={() => retry.mutate()}
      />
    );
  const preparing =
    preparation.isPending ||
    retry.isPending ||
    preparation.data.status === "pending" ||
    preparation.data.status === "preparing";
  if (preparing)
    return (
      <LoadingState
        title="Preparing your first Lesson…"
        description="Your Assessment Report is ready. Your coach is preparing Lessons for your Goals."
      />
    );
  if (preparation.data.status === "failed")
    return (
      <ErrorState
        title="We couldn't prepare your practice"
        description="Your Assessment Report is saved. Try again."
        retryLabel="Retry preparation"
        onRetry={() => retry.mutate()}
      />
    );
  if (preparation.data.status === "not_ready" && compact)
    return (
      <Stack gap={4} align="start">
        <Heading level={3} size="body">
          Confirm your Goals first
        </Heading>
        <Text size="caption" tone="muted">
          You need confirmed Goals and a completed Assessment.
        </Text>
        <Button size="sm" render={<Link to="/goals/confirm" />}>
          Review your Goals
        </Button>
      </Stack>
    );
  if (preparation.data.status === "not_ready")
    return (
      <EmptyState
        icon={MapTrifold}
        title="Confirm your Goals first"
        description="You need confirmed Goals and a completed Assessment."
        action={<Button render={<Link to="/goals/confirm" />}>Review your Goals</Button>}
      />
    );
  const lesson = preparation.data.lesson;
  if (lesson)
    return (
      <Button fullWidth render={<Link {...lessonRoute(lesson)} />}>
        Start {lesson.title}
      </Button>
    );
  return (
    <Button fullWidth render={<Link to="/roadmap" />}>
      See my Roadmap
    </Button>
  );
}
