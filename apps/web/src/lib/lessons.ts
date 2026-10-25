import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "./api";
import { roadmapQuery } from "./queries";

/** A Roleplay Lesson opens on the Roleplay screen, any other on the Lesson player. */
export const lessonRoute = (l: { id: string; kind: "practice" | "roleplay" }) =>
  l.kind === "roleplay"
    ? ({ to: "/roleplays/$roleplayId", params: { roleplayId: l.id } } as const)
    : ({ to: "/lessons/$lessonId", params: { lessonId: l.id } } as const);

type Pages = {
  preparation: string | null;
  pages: { status: "pending" | "ready" | "failed"; question?: string; result?: object }[];
  quiz?: { result?: object }[];
  practice?: string | null;
};
const analysing = (r?: object) => (r as { analysis?: string } | undefined)?.analysis === "analysing";

/** Nothing more will arrive once the Lesson failed or every Page and question is ready or failed, no spoken answer (on a Page or in the Quiz) is still being analysed and no Practice Round is being written. */
export const pagesSettled = (d?: Pages) =>
  Boolean(
    d &&
    (d.preparation === "failed" ||
      (d.pages.every((p) => p.status !== "pending" && p.question !== "pending" && !analysing(p.result)) &&
        !d.quiz?.some((q) => analysing(q.result)) &&
        d.practice !== "preparing")),
  );

/** Polls a paged Lesson's Pages every 1.5 seconds until they have all settled. */
export const lessonPagesQuery = (id: string) =>
  queryOptions({
    queryKey: ["lesson-pages", id],
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await api().api.lessons[":id"].pages.$get({ param: { id } }, { init: { signal } });
      if (!response.ok) throw new Error("We couldn't check on your Lesson.");
      return response.json();
    },
    // A failed check (the API restarting, a dropped connection) slows the polling down instead of stopping it for good.
    refetchInterval: (query) =>
      pagesSettled(query.state.data) ? false : query.state.status === "error" ? 5_000 : 1_500,
  });

/** Reserves the outlined Lesson at this position and queues its Pages. Pressing it twice returns the same Lesson. */
export function useStartLesson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (position: number) => {
      const response = await api().api.lessons[":position{[0-9]+}"].start.$post({
        param: { position: String(position) },
      });
      if (!response.ok) throw new Error(`Couldn't start your Lesson (${response.status})`);
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries(roadmapQuery),
  });
}

/** Resumes the Lesson in progress in the active Unit, or starts the next one (which may be its Roleplay), and opens it. */
export function useNextLesson() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const response = await api().api.lessons.next.$post();
      if (!response.ok) throw new Error(`Couldn't start your Lesson (${response.status})`);
      return response.json();
    },
    onSuccess: async (lesson) => {
      await queryClient.invalidateQueries(roadmapQuery);
      await navigate(lessonRoute(lesson));
    },
  });
}
