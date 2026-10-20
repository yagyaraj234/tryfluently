import { Grid, StatTile } from "@fluently/ui";
import { BookOpenText, CalendarCheck, CheckCircle } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { progressQuery } from "../../lib/queries";

export function LearningStats() {
  const learning = useQuery(progressQuery).data?.learning;
  if (!learning) return null;

  return (
    <Grid columns={3}>
      <StatTile
        icon={BookOpenText}
        value={learning.completedLessons}
        label={`of ${learning.plannedLessons} Lessons completed`}
      />
      <StatTile
        icon={CheckCircle}
        value={learning.completedUnits}
        label={`of ${learning.totalUnits} Units completed`}
      />
      <StatTile icon={CalendarCheck} value={learning.lessonsThisWeek} label="Lessons this week" />
    </Grid>
  );
}
