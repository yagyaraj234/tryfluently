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

/** Percentage of outlined Lessons completed, and how many Lessons are done. */
export function unitProgress(unit: Unit) {
  const done = unit.lessons.filter((l) => l.status === "completed");
  const total = new Set([
    ...(unit.lessonOutline ?? []).map((l) => l.position),
    ...unit.lessons.filter((l) => l.status !== "abandoned").map((l) => l.position),
  ]).size;
  return { value: total ? Math.min(100, Math.round((100 * done.length) / total)) : 0, lessonsDone: done.length };
}

async function json<T>(request: Promise<{ ok: boolean; status: number; json(): Promise<T> }>, what: string) {
  const response = await request;
  if (!response.ok) throw new Error(`Couldn't load your ${what} (${response.status})`);
  return response.json();
}

/** The latest score and CEFR Level per skill; `null` for a skill not measured yet. */
export const skillProfileQuery = queryOptions({
  queryKey: ["skill-profile"],
  queryFn: () => json(api().api["skill-profile"].$get(), "Skill Profile"),
});

/** Every score change, oldest first, from an Assessment or a Lesson. */
export const skillHistoryQuery = queryOptions({
  queryKey: ["skill-profile", "history"],
  queryFn: () => json(api().api["skill-profile"].history.$get(), "score history"),
});

export const focusItemsQuery = queryOptions({
  queryKey: ["focus-items"],
  queryFn: () => json(api().api["focus-items"].$get(), "Focus Items"),
});

export const assessmentsQuery = queryOptions({
  queryKey: ["assessments"],
  queryFn: () => json(api().api.assessments.$get(), "Assessments"),
});

/** Shared monthly live-call allowance, including active usage and the UTC renewal date. */
export const voiceMinutesQuery = queryOptions({
  queryKey: ["voice-minutes"],
  queryFn: () => json(api().api["voice-minutes"].$get(), "voice minutes"),
  staleTime: 0,
});

export const roleplaysQuery = queryOptions({
  queryKey: ["roleplays"],
  queryFn: () => json(api().api.roleplays.$get(), "Roleplays"),
});

export const reportsQuery = queryOptions({
  queryKey: ["reports"],
  queryFn: () => json(api().api.reports.$get(), "reports"),
});
