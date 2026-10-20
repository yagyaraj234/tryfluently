import { Button, LessonComplete, LoadingState, Text } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { progressQuery, roadmapQuery } from "../../lib/queries";

export function Complete({ xpGained, headingLevel = 1 }: { xpGained: number; headingLevel?: 1 | 2 }) {
  const progress = useQuery(progressQuery);
  const roadmap = useQuery(roadmapQuery);
  const finished = Boolean(
    roadmap.data?.length && roadmap.data.every((u) => u.status === "mastered" || u.status === "skipped"),
  );
  if (progress.isPending || progress.isFetching) return <LoadingState title="Adding up your XP" />;

  const nextAction = finished ? (
    <Text>Roadmap complete</Text>
  ) : (
    <Button render={<Link to="/roadmap" />}>Next Lesson</Button>
  );
  const actions = (
    <>
      {nextAction}
      <Button variant="secondary" render={<Link to="/home" />}>
        Back to Home
      </Button>
    </>
  );
  return (
    <LessonComplete
      headingLevel={headingLevel}
      xpGained={xpGained}
      streak={progress.data?.streak ?? 0}
      actions={actions}
    />
  );
}
