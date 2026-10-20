import { Button, LoadingState, Stack, Text } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { lessonRoute } from "../../lib/lessons";
import { practicePreparationQuery } from "../../lib/practice-preparation";
import type { Unit } from "../../lib/queries";

export function LessonAction({ unit }: { unit: Unit }) {
  const preparation = useQuery(practicePreparationQuery);
  const current = unit.lessons.find((l) => l.status === "in_progress");

  if (current?.preparation === "preparing" && preparation.data?.status !== "failed")
    return <LoadingState title="Preparing your Lesson" description="Your coach is getting your practice ready." />;

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
  // The next Lesson is written only after the Learner opens it on the Roadmap.
  return (
    <Button size="sm" render={<Link to="/roadmap" />}>
      Start your next Lesson
    </Button>
  );
}
