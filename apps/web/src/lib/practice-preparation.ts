import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";
import { roadmapQuery } from "./queries";

export const practicePreparationQuery = queryOptions({
  queryKey: ["practice-preparation"],
  retry: false,
  queryFn: async ({ signal }) => {
    const response = await api().api.assessments.preparation.$get({}, { init: { signal } });
    if (!response.ok) throw new Error("We couldn't check your practice preparation.");
    return response.json();
  },
  refetchInterval: (query) =>
    query.state.status !== "error" &&
    (query.state.data?.status === "pending" || query.state.data?.status === "preparing")
      ? 3_000
      : false,
});

/** Poll only unfinished work; refresh the Roadmap as preparation advances. */
export function usePracticePreparation() {
  const query = useQuery(practicePreparationQuery);
  const queryClient = useQueryClient();
  const status = query.data?.status;
  const lessonId = query.data?.lesson?.id;
  useEffect(() => {
    if (status && status !== "not_ready") void queryClient.invalidateQueries(roadmapQuery);
  }, [status, lessonId, queryClient]);
  return query;
}
