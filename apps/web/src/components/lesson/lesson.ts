import type { UIMessage } from "ai";
import { api } from "../../lib/api";

export async function fetchLesson(id: string) {
  const response = await api().api.lessons[":id"].$get({ param: { id } });
  if (!response.ok) throw new Error(`Couldn't load your Lesson (${response.status})`);
  const lesson = await response.json();
  return { ...lesson, messages: lesson.messages as unknown as UIMessage[] };
}

export type Lesson = Awaited<ReturnType<typeof fetchLesson>>;

export type Feedback = { verdict: "correct" | "almost" | "incorrect"; corrected: string; explanation: string };

export const lessonXp = (answered: number) => 20 + 10 * answered;
