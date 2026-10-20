import { EmptyState, RoadmapNode, RoadmapUnit, TextLink, UnitStatusTag } from "@impromptu/ui";
import { Hourglass } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { lessonRoute } from "../../lib/lessons";
import type { Unit } from "../../lib/queries";
import type { Selected } from "./StartLessonDialog";

type Lesson = Unit["lessons"][number];

function lessonDescription(lesson: Lesson) {
  if (lesson.status === "completed") return "Completed";
  if (lesson.preparation === "failed") return "Preparation failed. Retry";
  if (lesson.preparation === "preparing") return "Preparing";
  if (lesson.preparation === "ready") return "Ready";
  return "In progress";
}

function KnownLessonNode({ unit, lesson, onRetry }: { unit: Unit; lesson: Lesson; onRetry: () => void }) {
  const retry = lesson.preparation === "failed" || lesson.preparation === "preparing";
  const skill =
    lesson.kind === "roleplay"
      ? "fluency"
      : (unit.lessonOutline?.find((l) => l.title === lesson.title)?.skill ?? unit.skills[0]);
  return (
    <RoadmapNode
      state={lesson.status === "completed" ? "complete" : "active"}
      title={lesson.title}
      skill={skill}
      description={lessonDescription(lesson)}
      render={retry ? undefined : <Link {...lessonRoute(lesson)} />}
      onClick={retry ? onRetry : undefined}
    />
  );
}

type Props = { unit: Unit; onSelect: (lesson: Selected) => void; onRetry: () => void };

export function UnitSection({ unit, onSelect, onRetry }: Props) {
  const known = unit.lessons.filter((l) => l.status === "completed" || l.status === "in_progress");
  const current = known.some((l) => l.status === "in_progress");
  const count = unit.lessons.filter((l) => l.kind === "practice").length;
  const future = (unit.lessonOutline ?? []).filter((l) => l.kind === "practice" && l.position >= count);
  const roleplay = unit.lessonOutline?.find((l) => l.kind === "roleplay");
  const active = unit.status === "active";
  const open = active || unit.status === "planned";
  const selectable = active && !current;
  const showFuture = open && !(active && unit.roleplayReady);
  const showRoleplay = open && roleplay && !known.some((l) => l.kind === "roleplay");
  const roleplayActive = selectable && unit.roleplayReady;

  const futureNodes = showFuture
    ? future.map((lesson, index) => (
        <RoadmapNode
          key={lesson.position}
          title={lesson.title}
          skill={lesson.skill}
          state={selectable && index === 0 ? "active" : "locked"}
          onClick={selectable && index === 0 ? () => onSelect(lesson) : undefined}
        />
      ))
    : null;

  const roleplayNode = showRoleplay ? (
    <RoadmapNode
      state={roleplayActive ? "active" : "locked"}
      title={roleplay.title}
      skill="fluency"
      onClick={roleplayActive ? () => onSelect(roleplay) : undefined}
    />
  ) : null;

  const empty = !known.length && !futureNodes?.length && !roleplayNode;
  const placeholder = empty && (
    <EmptyState
      icon={Hourglass}
      title="No Lessons generated yet"
      description="This Unit's Lessons are still being planned. Check back soon."
    />
  );

  return (
    <RoadmapUnit
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
        <KnownLessonNode key={lesson.id} unit={unit} lesson={lesson} onRetry={onRetry} />
      ))}
      {futureNodes}
      {roleplayNode}
      {placeholder}
    </RoadmapUnit>
  );
}
