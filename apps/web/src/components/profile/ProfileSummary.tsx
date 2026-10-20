import { ErrorState, Grid, LoadingState, ProfileCard, Stack, StatTile, WeekStrip } from "@fluently/ui";
import { Books, CheckCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { progressQuery, roadmapQuery, skillProfileQuery } from "../../lib/queries";

const skills = ["fluency", "grammar", "vocabulary"] as const;

/** Shared Learner summary on Home and Profile. */
export function ProfileSummary({ name }: { name: string }) {
  const progress = useQuery(progressQuery);
  const roadmap = useQuery(roadmapQuery);
  const profile = useQuery(skillProfileQuery);
  const failed = [progress, roadmap, profile].find((query) => query.isError);
  if (failed) return <ErrorState description={failed.error!.message} onRetry={() => failed.refetch()} />;
  if (!progress.data || !roadmap.data || !profile.data) return <LoadingState title="Loading your profile" />;

  const lessonsDone = roadmap.data
    .flatMap((unit) => unit.lessons)
    .filter((lesson) => lesson.status === "completed").length;
  const unitsActive = roadmap.data.filter((unit) => unit.status === "active").length;

  return (
    <Stack gap={3}>
      <ProfileCard
        name={name}
        levels={skills
          .filter((skill) => profile.data[skill])
          .map((skill) => ({ skill, level: profile.data[skill]!.level }))}
        levelsRender={<Link to="/progress" aria-label="Your Skill Profile" />}
        streak={progress.data.streak}
        xp={progress.data.xp}
        unitsMastered={roadmap.data.filter((unit) => unit.status === "mastered").length}
      />
      <WeekStrip week={progress.data.week} />
      <Grid columns={2}>
        <StatTile icon={CheckCircle} value={lessonsDone} label={lessonsDone === 1 ? "Lesson done" : "Lessons done"} />
        <StatTile
          icon={Books}
          value={unitsActive}
          label={unitsActive === 1 ? "Unit in progress" : "Units in progress"}
        />
      </Grid>
    </Stack>
  );
}
