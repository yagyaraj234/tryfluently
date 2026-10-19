import { Button, ErrorState, LoadingState } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { lessonRoute, useNextLesson } from "../../lib/lessons";
import { practicePreparationQuery } from "../../lib/practice-preparation";
import type { Unit } from "../../lib/queries";

/** The active Unit's main action: resume its Lesson in progress, or start the next one (which may be its Roleplay). */
export function LessonAction({ unit }: { unit: Unit }) {
  const next = useNextLesson();
  const preparation = useQuery(practicePreparationQuery);
  const current = unit.lessons.find((l) => l.status === "in_progress");

  if (current?.preparation === "preparing" && preparation.data?.status !== "failed")
    return <LoadingState title="Preparing your Lesson" description="Your coach is getting your practice ready." />;

  // Stays up after success too, until the navigation lands.
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
  return current && current.preparation !== "failed" && current.preparation !== "preparing" ? (
    <Button size="sm" render={<Link {...lessonRoute(current)} />}>{`Resume ${current.title}`}</Button>
  ) : (
    <Button size="sm" onClick={() => next.mutate()}>
      Start your next Lesson
    </Button>
  );
}
