import { FlagCheckered } from "@phosphor-icons/react";
import { Button, EmptyState, ErrorState, Stack, Text } from "@fluently/ui";
import { createFileRoute, Link, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useState } from "react";
import { Complete } from "../../../../components/lesson/Complete";
import { fetchLesson, lessonXp, type Lesson } from "../../../../components/lesson/lesson";
import { LessonReview } from "../../../../components/lesson/LessonReview";
import { Player } from "../../../../components/lesson/Player";
import { PagedPlayer } from "../../../../components/lesson/PagedPlayer";
import { PreparedPlayer } from "../../../../components/lesson/PreparedPlayer";
import { lessonRoute } from "../../../../lib/lessons";
import { progressQuery, roadmapQuery } from "../../../../lib/queries";

export const Route = createFileRoute("/_signedIn/_practice/lessons/$lessonId")({
  // useChat seeds history once per mount; don't mount it from stale route data on a return visit.
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ params, context }) => {
      const [lesson] = await Promise.all([
        fetchLesson(params.lessonId),
        context.queryClient.prefetchQuery(progressQuery),
        context.queryClient.prefetchQuery(roadmapQuery),
      ]);
      if (lesson.kind === "roleplay") throw redirect(lessonRoute(lesson));
      return lesson;
    },
  },
  component: LessonScreen,
  errorComponent: LessonError,
});

function LessonError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const description = error instanceof Error ? error.message : undefined;
  return (
    <ErrorState title="Your Lesson couldn't be loaded" description={description} onRetry={() => router.invalidate()} />
  );
}

function LessonSummary({ lesson, onReview }: { lesson: Lesson; onReview: () => void }) {
  return (
    <Stack gap={6}>
      <Text tone="muted">No detailed report is available for this Lesson.</Text>
      <Complete xpGained={lessonXp(lesson.steps.filter((s) => s.answeredAt).length)} />
      {lesson.steps.length > 0 && (
        <Button variant="secondary" onClick={onReview}>
          Review this Lesson
        </Button>
      )}
    </Stack>
  );
}

function LessonScreen() {
  const lesson = Route.useLoaderData();
  const [review, setReview] = useState(false);

  if (lesson.status === "abandoned")
    return (
      <EmptyState
        icon={FlagCheckered}
        title="This Lesson has ended"
        description="Its Unit was skipped. Continue with your active Unit."
        action={<Button render={<Link to="/home" />}>Back to Home</Button>}
      />
    );
  // Keyed: a new Lesson (from Lesson complete's "Next Lesson") gets a fresh player.
  if (lesson.contentVersion === 2) return <PagedPlayer key={lesson.id} lesson={lesson} />;
  if (lesson.preparation || lesson.report) return <PreparedPlayer key={lesson.id} lesson={lesson} />;
  if (lesson.status === "in_progress") return <Player key={lesson.id} lesson={lesson} />;
  if (review) return <LessonReview lesson={lesson} onClose={() => setReview(false)} />;
  return <LessonSummary lesson={lesson} onReview={() => setReview(true)} />;
}
