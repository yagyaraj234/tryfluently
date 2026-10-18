import {
  Button,
  Card,
  CefrScale,
  Container,
  EmptyState,
  ErrorState,
  FocusItemCard,
  Heading,
  LoadingState,
  ScoreHistory,
  SkillBar,
  Stack,
  Text,
  type Skill,
} from "@impromptu/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { assessmentsQuery, focusItemsQuery, skillHistoryQuery, skillProfileQuery } from "../../../lib/queries";

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
    ]),
  component: Progress,
});

const skills: { skill: Skill; name: string; unmeasured: string }[] = [
  { skill: "fluency", name: "Fluency", unmeasured: "Fluency is measured when you speak, in a Voice Assessment or a spoken Step." },
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
  const all = [profile, history, focusItems, assessments];

  // Dates in the Learner's timezone, so the server and the browser render the same day.
  const timeZone = learner.timezone;
  const day = (at: string) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone });

  return (
    <Container>
      <Stack gap={8}>
        {all.some((q) => q.isError) ? (
          <ErrorState description="We couldn't load your progress." onRetry={() => all.forEach((q) => q.isError && q.refetch())} />
        ) : !profile.data || !history.data || !focusItems.data || !assessments.data ? (
          <LoadingState title="Loading your progress" />
        ) : (
          <>
            <Stack gap={4}>
              <Heading level={2}>Skill Profile</Heading>
              {skills.map(({ skill, name, unmeasured }) => {
                const current = profile.data[skill];
                const entries = history.data
                  .filter((h) => h.skill === skill)
                  .reverse()
                  .map((h) => ({ id: `${h.source}-${h.sourceId}`, date: day(h.createdAt), score: h.score, level: h.level, source: h.source }));
                return (
                  <Card key={skill}>
                    {current ? (
                      <Stack gap={5}>
                        <SkillBar skill={skill} score={current.score} level={current.level} />
                        <CefrScale label={`${name} CEFR Level`} level={current.level} />
                        <ScoreHistory label={`${name} history`} entries={entries} />
                      </Stack>
                    ) : (
                      <EmptyState title={`No ${name.toLowerCase()} score yet`} description={unmeasured} />
                    )}
                  </Card>
                );
              })}
              <Retake assessments={assessments.data} timeZone={timeZone} />
            </Stack>
            <Stack gap={4}>
              <Heading level={2}>Focus Items</Heading>
              {focusItems.data.length ? (
                // Open first; within each, the API's order (oldest first).
                [...focusItems.data]
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
                  ))
              ) : (
                <EmptyState
                  title="No Focus Items yet"
                  description="Things to practise come from your Assessment Report, Debriefs and repeated mistakes."
                />
              )}
            </Stack>
          </>
        )}
      </Stack>
    </Container>
  );
}

function Retake({ assessments, timeZone }: { assessments: { status: string; endedAt: string | null }[]; timeZone: string }) {
  const last = Math.max(...assessments.filter((a) => a.status === "completed" && a.endedAt).map((a) => Date.parse(a.endedAt!)));
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
