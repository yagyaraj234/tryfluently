import { Button, ErrorState, LoadingState, Notice, Stack } from "@fluently/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BuildRoadmap } from "../../../../components/roadmap/BuildRoadmap";
import { PlanningNotice } from "../../../../components/roadmap-view/PlanningNotice";
import { StartLessonDialog, type Selected } from "../../../../components/roadmap-view/StartLessonDialog";
import { StartingLesson, type Starting } from "../../../../components/roadmap-view/StartingLesson";
import { UnitSection } from "../../../../components/roadmap-view/UnitSection";
import { useOutlinePlanning } from "../../../../components/roadmap-view/useOutlinePlanning";
import { useNextLesson, useStartLesson } from "../../../../lib/lessons";
import { practicePreparationQuery } from "../../../../lib/practice-preparation";
import { roadmapQuery } from "../../../../lib/queries";

export const Route = createFileRoute("/_signedIn/_app/roadmap/")({
  staticData: { title: "Roadmap" },
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(roadmapQuery),
      context.queryClient.prefetchQuery(practicePreparationQuery),
    ]),
  component: Roadmap,
});

function Roadmap() {
  const roadmap = useQuery(roadmapQuery);
  const next = useNextLesson();
  const start = useStartLesson();
  const [selected, setSelected] = useState<Selected>();
  const [starting, setStarting] = useState<Starting>();
  const { planning, missing } = useOutlinePlanning(roadmap.data);
  const startNext = () => next.mutate();
  // A practice Lesson is written in the background after Start learning; a Roleplay opens straight away.
  const confirm = () => {
    if (!selected) return;
    if (selected.kind === "roleplay") return next.mutate();
    start.mutate(selected.position, {
      onSuccess: (lesson) => {
        setStarting({ id: lesson.id, title: selected.title, objective: selected.objective });
        setSelected(undefined);
      },
    });
  };
  const dialogMutation = selected?.kind === "roleplay" ? next : start;

  if (starting) return <StartingLesson {...starting} />;

  let units;
  if (roadmap.isPending) units = <LoadingState title="Loading your Roadmap" />;
  else if (roadmap.isError)
    units = <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />;
  else if (!roadmap.data.length) units = <BuildRoadmap />;
  else
    units = (
      <Stack gap={10}>
        {roadmap.data.map((unit) => (
          <UnitSection key={unit.id} unit={unit} onSelect={setSelected} onRetry={startNext} onResume={setStarting} />
        ))}
      </Stack>
    );

  return (
    <Stack gap={6}>
      {missing && <PlanningNotice failed={planning.isError} onRetry={() => planning.mutate()} />}
      {units}
      {next.isError && (
        <Notice tone="error">
          Your Lesson isn't ready. Try again in a moment.{" "}
          <Button size="sm" variant="secondary" onClick={startNext}>
            Retry preparation
          </Button>
        </Notice>
      )}
      {next.isPending && <LoadingState title="Preparing your Lesson" />}
      <StartLessonDialog
        selected={selected}
        pending={dialogMutation.isPending}
        success={dialogMutation.isSuccess}
        failed={dialogMutation.isError}
        error={dialogMutation.error?.message}
        onStart={confirm}
        onClose={() => setSelected(undefined)}
      />
    </Stack>
  );
}
