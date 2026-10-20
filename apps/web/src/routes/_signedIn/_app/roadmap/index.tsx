import { Button, ErrorState, LoadingState, Notice, Stack } from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BuildRoadmap } from "../../../../components/roadmap/BuildRoadmap";
import { PlanningNotice } from "../../../../components/roadmap-view/PlanningNotice";
import { StartLessonDialog, type Selected } from "../../../../components/roadmap-view/StartLessonDialog";
import { UnitSection } from "../../../../components/roadmap-view/UnitSection";
import { useOutlinePlanning } from "../../../../components/roadmap-view/useOutlinePlanning";
import { useNextLesson } from "../../../../lib/lessons";
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
  const [selected, setSelected] = useState<Selected>();
  const { planning, missing } = useOutlinePlanning(roadmap.data);
  const startNext = () => next.mutate();

  let units;
  if (roadmap.isPending) units = <LoadingState title="Loading your Roadmap" />;
  else if (roadmap.isError)
    units = <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />;
  else if (!roadmap.data.length) units = <BuildRoadmap />;
  else
    units = (
      <Stack gap={10}>
        {roadmap.data.map((unit) => (
          <UnitSection key={unit.id} unit={unit} onSelect={setSelected} onRetry={startNext} />
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
        pending={next.isPending}
        success={next.isSuccess}
        failed={next.isError}
        onStart={startNext}
        onClose={() => setSelected(undefined)}
      />
    </Stack>
  );
}
