import {
  Button,
  Card,
  Container,
  EmptyState,
  ErrorState,
  FocusItemCard,
  Heading,
  LoadingState,
  ProgressOverview,
  ProgressCheckIn,
  SkillProgressCard,
  Cluster,
  Grid,
  Stack,
  Text,
  type Skill,
} from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  reportsQuery,
  progressQuery,
  assessmentsQuery,
  focusItemsQuery,
  skillHistoryQuery,
  skillProfileQuery,
} from "../../../lib/queries";

/** The Skill Profile with each skill's history, the Focus Items and retaking the Assessment. */
export const Route = createFileRoute("/_signedIn/_app/progress")({
  staticData: { title: "Progress" },
  // Never throws: a failed query shows its error state in the page.
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.prefetchQuery(skillProfileQuery),
      queryClient.prefetchQuery(skillHistoryQuery),
      queryClient.prefetchQuery(focusItemsQuery),
      queryClient.prefetchQuery(assessmentsQuery),
      queryClient.prefetchQuery(reportsQuery),
    ]),
  component: Progress,
});

const skills: { skill: Skill; name: string; unmeasured: string }[] = [
  {
    skill: "fluency",
    name: "Fluency",
    unmeasured: "Fluency is measured when you speak, in a Voice Assessment or a spoken Step.",
  },
  { skill: "grammar", name: "Grammar", unmeasured: "Grammar is measured in your Assessment and Lessons." },
  { skill: "vocabulary", name: "Vocabulary", unmeasured: "Vocabulary is measured in your Assessment and Lessons." },
];

// ponytail: mirrors the API's rules (lessons.ts HITS_TO_CLOSE, assessments.ts RETAKE_DAYS); have the API return them if they change.
const HITS_TO_CLOSE = 3;
const RETAKE_DAYS = 7;

function Progress() {
  const { learner } = Route.useRouteContext();
  const [profile, history, focusItems, assessments] = [
    useQuery(skillProfileQuery),
    useQuery(skillHistoryQuery),
    useQuery(focusItemsQuery),
    useQuery(assessmentsQuery),
  ];
  const reports = useQuery(reportsQuery);
  const progress = useQuery(progressQuery);
  const all = [profile, history, focusItems, assessments];

  // Dates in the Learner's timezone, so the server and the browser render the same day.
  const timeZone = learner.timezone;
  const day = (at: string) =>
    new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });

  return (
    <Container width="page">
      <Stack gap={8}>
        {all.some((q) => q.isError) ? (
          <ErrorState
            description="We couldn't load your progress."
            onRetry={() => all.forEach((q) => q.isError && q.refetch())}
          />
        ) : !profile.data || !history.data || !focusItems.data || !assessments.data ? (
          <LoadingState title="Loading your progress" />
        ) : (
          <>
            <Stack gap={2}>
              <Heading level={2}>Your skills over time</Heading>
              <Text tone="muted">Current levels, every score behind them, and the Focus Items still open.</Text>
            </Stack>
            {progress.data?.learning && (
              <Card>
                <Stack gap={2}>
                  <Heading level={2} size="title">
                    Learning pace
                  </Heading>
                  <Text>
                    {progress.data.learning.completedLessons} of {progress.data.learning.plannedLessons} Lessons
                    completed
                  </Text>
                  <Text>
                    {progress.data.learning.completedUnits} of {progress.data.learning.totalUnits} Units completed ·{" "}
                    {progress.data.learning.lessonsThisWeek} Lessons this week
                  </Text>
                </Stack>
              </Card>
            )}
            <Stack gap={4}>
              <Heading level={2}>Reports</Heading>
              {reports.isPending ? (
                <LoadingState title="Loading reports" />
              ) : reports.isError ? (
                <ErrorState description="Your reports couldn't be loaded." onRetry={() => reports.refetch()} />
              ) : !reports.data.length ? (
                <Text tone="muted">No reports yet.</Text>
              ) : (
                reports.data.map((report) => (
                  <Card key={`${report.kind}-${report.id}`}>
                    <Stack gap={2} align="start">
                      <Heading level={3} size="title">
                        {report.title}
                      </Heading>
                      <Text tone="muted">{report.at ? day(report.at) : ""}</Text>
                      <Button
                        variant="secondary"
                        render={
                          report.kind === "assessment" ? (
                            <Link to="/assessments/$assessmentId/report" params={{ assessmentId: report.id }} />
                          ) : report.kind === "roleplay" ? (
                            <Link to="/roleplays/$roleplayId" params={{ roleplayId: report.id }} />
                          ) : (
                            <Link to="/lessons/$lessonId" params={{ lessonId: report.id }} />
                          )
                        }
                      >
                        View report
                      </Button>
                    </Stack>
                  </Card>
                ))
              )}
            </Stack>
            <ProgressOverview
              skills={skills.map(({ skill, unmeasured }) => (
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
                      date: day(h.createdAt),
                      score: h.score,
                      level: h.level,
                      source: h.source,
                    }))}
                />
              ))}
              focus={
                <Stack gap={4}>
                  <Stack gap={2}>
                    <Cluster justify="between">
                      <Heading level={2} size="title">
                        Focus Items
                      </Heading>
                      <Text size="caption" tone="muted">
                        {focusItems.data.filter((item) => item.status === "open").length} open ·{" "}
                        {focusItems.data.filter((item) => item.status === "closed").length} closed
                      </Text>
                    </Cluster>
                    <Text size="caption" tone="muted">
                      Repeated mistakes to fix. Three correct uses close one.
                    </Text>
                  </Stack>
                  {focusItems.data.length ? (
                    <Grid columns={3}>
                      {[...focusItems.data]
                        .sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed"))
                        .map((item) => (
                          <FocusItemCard
                            key={item.id}
                            label={item.label}
                            kind={item.kind}
                            status={item.status}
                            hits={item.hits}
                            hitsToClose={HITS_TO_CLOSE}
                          />
                        ))}
                    </Grid>
                  ) : (
                    <Card>
                      <EmptyState
                        title="No Focus Items yet"
                        description="Focus Items come from your Assessment Report, Debriefs and repeated mistakes."
                      />
                    </Card>
                  )}
                </Stack>
              }
              assessment={
                <ProgressCheckIn action={<Retake assessments={assessments.data} timeZone={timeZone} />}>
                  <Text size="label" tone="muted">
                    Your next check-in
                  </Text>
                  <Heading level={2} size="title">
                    Check your level again
                  </Heading>
                  <Text size="caption" tone="muted">
                    A new score for each skill the Assessment measures.
                  </Text>
                </ProgressCheckIn>
              }
            />
          </>
        )}
      </Stack>
    </Container>
  );
}

function Retake({
  assessments,
  timeZone,
}: {
  assessments: { status: string; endedAt: string | null }[];
  timeZone: string;
}) {
  const last = Math.max(
    ...assessments.filter((a) => a.status === "completed" && a.endedAt).map((a) => Date.parse(a.endedAt!)),
  );
  const opensAt = last + RETAKE_DAYS * 86_400_000;
  const locked = opensAt > Date.now();
  return (
    <Stack gap={3} align="start">
      <Button variant="secondary" render={<Link to="/assessments/new" />}>
        Retake the Assessment
      </Button>
      {locked && (
        <Text tone="muted">
          You can take the Assessment once a week. Your next Assessment opens on{" "}
          {new Date(opensAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone })}.
        </Text>
      )}
    </Stack>
  );
}
