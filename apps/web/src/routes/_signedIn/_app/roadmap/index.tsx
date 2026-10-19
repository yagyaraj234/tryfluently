import {
  Button,
  Container,
  Dialog,
  ErrorState,
  LoadingState,
  Notice,
  RoadmapNode,
  RoadmapUnit,
  Stack,
  TextLink,
  UnitStatusTag,
} from "@impromptu/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BuildRoadmap } from "../../../../components/roadmap/BuildRoadmap";
import { api } from "../../../../lib/api";
import { lessonRoute, useNextLesson } from "../../../../lib/lessons";
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
  const queryClient = useQueryClient();
  const next = useNextLesson();
  const [selected, setSelected] = useState<{ title: string; objective: string }>();
  const planning = useMutation({
    mutationFn: async () => {
      const response = await api().api.roadmap.outline.$post();
      if (!response.ok) throw new Error("Your Lesson outlines couldn’t be prepared.");
      await queryClient.invalidateQueries(roadmapQuery);
    },
  });
  const missing = (roadmap.data ?? [])
    .filter((u) => (u.status === "active" || u.status === "planned") && !u.lessonOutline?.length)
    .map((u) => u.id)
    .join(",");
  const requested = useRef("");
  const { mutate } = planning;
  useEffect(() => {
    if (!missing || requested.current === missing) return;
    requested.current = missing;
    mutate();
  }, [missing, mutate]);

  return (
    <Container width="page">
      <Stack gap={6}>
        {missing &&
          (planning.isError ? (
            <Notice tone="error">
              Your existing Lessons are safe. We couldn’t plan the remaining Lessons.{" "}
              <Button variant="secondary" size="sm" onClick={() => planning.mutate()}>
                Try again
              </Button>
            </Notice>
          ) : (
            <LoadingState title="Planning your Lessons" description="Choosing different practice for each Unit." />
          ))}
        {roadmap.isPending ? (
          <LoadingState title="Loading your Roadmap" />
        ) : roadmap.isError ? (
          <ErrorState description={roadmap.error.message} onRetry={() => roadmap.refetch()} />
        ) : roadmap.data.length ? (
          <Stack gap={10}>
            {roadmap.data.map((unit) => {
              const known = unit.lessons.filter((l) => l.status === "completed" || l.status === "in_progress");
              const current = known.some((l) => l.status === "in_progress");
              const count = unit.lessons.filter((l) => l.kind === "practice").length;
              const future = (unit.lessonOutline ?? []).filter((l) => l.kind === "practice" && l.position >= count);
              const roleplay = unit.lessonOutline?.find((l) => l.kind === "roleplay");
              const active = unit.status === "active";
              const open = active || unit.status === "planned";
              return (
                <RoadmapUnit
                  key={unit.id}
                  number={unit.position + 1}
                  title={unit.title}
                  description={unit.objective}
                  detail={
                    <TextLink render={<Link to="/roadmap/$unitId" params={{ unitId: unit.id }} />}>
                      <UnitStatusTag status={unit.status} />
                    </TextLink>
                  }
                >
                  {known.map((lesson) => (
                    <RoadmapNode
                      key={lesson.id}
                      state={lesson.status === "completed" ? "complete" : "active"}
                      title={lesson.title}
                      skill={
                        lesson.kind === "roleplay"
                          ? "fluency"
                          : (unit.lessonOutline?.find((l) => l.title === lesson.title)?.skill ?? unit.skills[0])
                      }
                      description={
                        lesson.status === "completed"
                          ? "Completed"
                          : lesson.preparation === "failed"
                            ? "Preparation failed. Retry"
                            : lesson.preparation === "preparing"
                              ? "Preparing"
                              : lesson.preparation === "ready"
                                ? "Ready"
                                : "In progress"
                      }
                      render={
                        lesson.preparation === "failed" || lesson.preparation === "preparing" ? undefined : (
                          <Link {...lessonRoute(lesson)} />
                        )
                      }
                      onClick={
                        lesson.preparation === "failed" || lesson.preparation === "preparing"
                          ? () => next.mutate()
                          : undefined
                      }
                    />
                  ))}
                  {open &&
                    !(active && unit.roleplayReady) &&
                    future.map((lesson, index) => (
                      <RoadmapNode
                        key={lesson.position}
                        title={lesson.title}
                        skill={lesson.skill}
                        state={active && !current && index === 0 ? "active" : "locked"}
                        onClick={active && !current && index === 0 ? () => setSelected(lesson) : undefined}
                      />
                    ))}
                  {open && roleplay && !known.some((l) => l.kind === "roleplay") && (
                    <RoadmapNode
                      state={active && !current && unit.roleplayReady ? "active" : "locked"}
                      title={roleplay.title}
                      skill="fluency"
                      onClick={active && !current && unit.roleplayReady ? () => setSelected(roleplay) : undefined}
                    />
                  )}
                </RoadmapUnit>
              );
            })}
          </Stack>
        ) : (
          <BuildRoadmap />
        )}
        {next.isError && (
          <Notice tone="error">
            Your Lesson isn't ready. Try again in a moment.{" "}
            <Button size="sm" variant="secondary" onClick={() => next.mutate()}>
              Retry preparation
            </Button>
          </Notice>
        )}
        {next.isPending && <LoadingState title="Preparing your Lesson" />}
        <Dialog
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open && !next.isPending) setSelected(undefined);
          }}
          title={`Start ${selected?.title ?? "your Lesson"}?`}
          description={selected?.objective}
        >
          {next.isError && <Notice tone="error">Your Lesson couldn’t be started. Try again.</Notice>}
          <Button fullWidth disabled={next.isPending || next.isSuccess} onClick={() => next.mutate()}>
            {next.isPending || next.isSuccess ? "Preparing your Lesson…" : "Start Lesson"}
          </Button>
        </Dialog>
      </Stack>
    </Container>
  );
}
