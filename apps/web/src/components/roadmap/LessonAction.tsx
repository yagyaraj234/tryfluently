import { Button, ErrorState, LoadingState } from "@impromptu/ui";
import { Link } from "@tanstack/react-router";
import { lessonRoute, useNextLesson } from "../../lib/lessons";
import type { Unit } from "../../lib/queries";

/** The active Unit's main action: resume its Lesson in progress, or start the next one (which may be its Roleplay). */
export function LessonAction({ unit }: { unit: Unit }) {
  const next = useNextLesson();
  const current = unit.lessons.find((l) => l.status === "in_progress");

  // Stays up after success too, until the navigation lands.
  if (next.isPending || next.isSuccess)
    return <LoadingState title="Preparing your Lesson" description="It's built from how your last Lessons went." />;
  if (next.isError)
    return <ErrorState title="Your Lesson couldn't be prepared" description="Try again in a moment." onRetry={() => next.mutate()} />;
  return current ? (
    <Button render={<Link {...lessonRoute(current)} />}>{`Resume ${current.title}`}</Button>
  ) : (
    <Button onClick={() => next.mutate()}>Start your next Lesson</Button>
  );
}
