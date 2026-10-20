import { ErrorState, LoadingState, PollyWalking } from "@impromptu/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { api } from "../../lib/api";
import { lessonPagesQuery, lessonRoute } from "../../lib/lessons";

export type Starting = { id: string; title: string; objective: string };

/** Waits for Page 1 of a Lesson being written, then opens it. A failed Lesson can be retried. */
export function StartingLesson({ id, title, objective }: Starting) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pages = useQuery(lessonPagesQuery(id));
  const retry = useMutation({
    mutationFn: async () => {
      const response = await api().api.lessons[":id"].retry.$post({ param: { id } });
      if (!response.ok) throw new Error("We couldn't retry your Lesson.");
    },
    onSuccess: () => queryClient.invalidateQueries(lessonPagesQuery(id)),
  });
  const failed = pages.data?.preparation === "failed" || pages.data?.pages[0]?.status === "failed";
  const ready = pages.data?.pages[0]?.status === "ready";

  useEffect(() => {
    if (ready) void navigate(lessonRoute({ id, kind: "practice" }));
  }, [ready, id, navigate]);

  if (failed || pages.isError || retry.isError)
    return (
      <ErrorState
        title="Your Lesson couldn't be written"
        description="Try again in a moment."
        retryLabel="Retry"
        onRetry={() => (failed ? retry.mutate() : void pages.refetch())}
      />
    );
  return <LoadingState title={title} description={objective} mascot={<PollyWalking />} />;
}
