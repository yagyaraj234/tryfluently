import {
  ErrorState,
  Heading,
  LoadingState,
  ProgressOverview,
  SkillProgressCard,
  Stack,
  Text,
  type Skill,
} from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { assessmentsQuery, focusItemsQuery, skillHistoryQuery, skillProfileQuery } from "../../lib/queries";
import { formatDay } from "./day";
import { FocusItems } from "./FocusItems";
import { LearningStats } from "./LearningStats";
import { Reports } from "./Reports";
import { RetakeCheckIn } from "./RetakeCheckIn";

const skills: { skill: Skill; name: string; unmeasured: string }[] = [
  {
    skill: "fluency",
    name: "Fluency",
    unmeasured: "Fluency is measured when you speak, in a Voice Assessment or a spoken Step.",
  },
  { skill: "grammar", name: "Grammar", unmeasured: "Grammar is measured in your Assessment and Lessons." },
  { skill: "vocabulary", name: "Vocabulary", unmeasured: "Vocabulary is measured in your Assessment and Lessons." },
];

export function ProgressContent({ timeZone }: { timeZone: string }) {
  const profile = useQuery(skillProfileQuery);
  const history = useQuery(skillHistoryQuery);
  const focusItems = useQuery(focusItemsQuery);
  const assessments = useQuery(assessmentsQuery);
  const all = [profile, history, focusItems, assessments];

  if (all.some((q) => q.isError))
    return (
      <ErrorState
        description="We couldn't load your progress."
        onRetry={() => all.forEach((q) => q.isError && q.refetch())}
      />
    );
  if (!profile.data || !history.data || !focusItems.data || !assessments.data)
    return <LoadingState title="Loading your progress" />;

  const skillCards = skills.map(({ skill, unmeasured }) => (
    <SkillProgressCard
      key={skill}
      skill={skill}
      current={profile.data[skill]}
      unmeasured={unmeasured}
      entries={history.data
        .filter((h) => h.skill === skill)
        .reverse()
        .map((h) => ({
          id: `${h.source}-${h.sourceId}`,
          date: formatDay(h.createdAt, timeZone),
          score: h.score,
          level: h.level,
          source: h.source,
        }))}
    />
  ));

  return (
    <>
      <Stack gap={2}>
        <Heading level={2} size="title">
          Your skills over time
        </Heading>
        <Text tone="muted">Current levels, every score behind them, and the Focus Items still open.</Text>
      </Stack>
      <LearningStats />
      <ProgressOverview
        skills={skillCards}
        focus={<FocusItems items={focusItems.data} />}
        assessment={<RetakeCheckIn assessments={assessments.data} timeZone={timeZone} />}
      />
      <Reports timeZone={timeZone} />
    </>
  );
}
