import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { api } from "./api";
import { roadmapQuery } from "./queries";

/** A Roleplay Lesson opens on the Roleplay screen, any other on the Lesson player. */
export const lessonRoute = (l: { id: string; kind: "practice" | "roleplay" }) =>
  l.kind === "roleplay"
    ? ({ to: "/roleplays/$roleplayId", params: { roleplayId: l.id } } as const)
    : ({ to: "/lessons/$lessonId", params: { lessonId: l.id } } as const);

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
