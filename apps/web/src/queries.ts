import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";

/** XP and Streak. Invalidate `progressQuery.queryKey` after a Step is answered or a Lesson completes. */
export const progressQuery = queryOptions({
  queryKey: ["progress"],
  queryFn: async () => {
    const response = await api().api.progress.$get();
    if (!response.ok) throw new Error(`Couldn't load your progress (${response.status})`);
    return response.json();
  },
});

/** Every Unit in order, each with its Lessons. Empty when the Roadmap hasn't been built. */
export const roadmapQuery = queryOptions({
  queryKey: ["roadmap"],
  queryFn: async () => {
    const response = await api().api.roadmap.$get();
    if (!response.ok) throw new Error(`Couldn't load your Roadmap (${response.status})`);
    return response.json();
  },
});

export type Unit = Awaited<ReturnType<NonNullable<typeof roadmapQuery.queryFn>>>[number];
