import { Card, Heading, Stack, Text } from "@fluently/ui";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { Complete } from "./Complete";

/** Checks every 2 seconds until the background analysis is done or has failed. */
const analysisQuery = (id: string) =>
  queryOptions({
    queryKey: ["lesson-analysis", id],
    retry: false,
    queryFn: async () => {
      const response = await api().api.lessons[":id"].analysis.$get({ param: { id } });
      if (!response.ok) throw new Error("We couldn't check on your summary.");
      return response.json() as Promise<{
        status: "pending" | "running" | "done" | "failed" | null;
        summary: string | null;
      }>;
    },
    refetchInterval: (query) =>
      query.state.status === "error" || query.state.data?.status === "done" || query.state.data?.status === "failed"
        ? false
        : 2_000,
  });

/** End screen of a paged Lesson: score, XP and next up straight away, plus "what I learned" once the analysis is ready. */
export function PagedComplete({
  lessonId,
  xpGained,
  correct,
  graded,
}: {
  lessonId: string;
  xpGained: number;
  correct: number;
  graded: number;
}) {
  const { data } = useQuery(analysisQuery(lessonId));
  return (
    <Stack gap={4}>
      <Complete xpGained={xpGained} />
      {graded > 0 && <Text>{`You got ${correct} of ${graded} checked questions right.`}</Text>}
      {data?.status === "done" && data.summary && (
        <Card>
          <Stack gap={2}>
            <Heading level={2}>What I learned</Heading>
            <Text>{data.summary}</Text>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
