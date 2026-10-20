import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../../lib/api";
import { roadmapQuery, type Unit } from "../../lib/queries";

export function useOutlinePlanning(units: Unit[] | undefined) {
  const queryClient = useQueryClient();
  const planning = useMutation({
    mutationFn: async () => {
      const response = await api().api.roadmap.outline.$post();
      if (!response.ok) throw new Error("Your Lesson outlines couldn’t be prepared.");
      await queryClient.invalidateQueries(roadmapQuery);
    },
  });
  const missing = (units ?? [])
    .filter((u) => (u.status === "active" || u.status === "planned") && !u.lessonOutline?.length)
    .map((u) => u.id)
    .join(",");
  const requested = useRef("");
  const { mutate } = planning;
  useEffect(() => {
    if (!missing || requested.current === missing) return;
    requested.current = missing;
    mutate();
  }, [missing, mutate]);

  return { planning, missing };
}
