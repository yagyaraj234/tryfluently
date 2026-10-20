import { Button, ErrorState, LoadingState, Stack, Text } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { lessonRoute, useNextLesson } from "../../lib/lessons";
import { practicePreparationQuery } from "../../lib/practice-preparation";
import type { Unit } from "../../lib/queries";

export function LessonAction({ unit }: { unit: Unit }) {
  const next = useNextLesson();
  const preparation = useQuery(practicePreparationQuery);
  const current = unit.lessons.find((l) => l.status === "in_progress");

  if (current?.preparation === "preparing" && preparation.data?.status !== "failed")
    return <LoadingState title="Preparing your Lesson" description="Your coach is getting your practice ready." />;

  if (next.isPending || next.isSuccess)
    return <LoadingState title="Preparing your Lesson" description="It uses how your last Lessons went." />;
  if (next.isError)
    return (
      <ErrorState
        title="Your Lesson couldn't be prepared"
        description="Try again in a moment."
        onRetry={() => next.mutate()}
      />
    );
  if (current && current.preparation !== "failed" && current.preparation !== "preparing")
    return (
      <Stack gap={2} align="start">
        <Text size="caption" tone="muted">
          {current.title}
        </Text>
        <Button size="sm" render={<Link {...lessonRoute(current)} />}>
          Resume Lesson
        </Button>
      </Stack>
    );
  return (
    <Button size="sm" onClick={() => next.mutate()}>
      Start your next Lesson
    </Button>
  );
}
