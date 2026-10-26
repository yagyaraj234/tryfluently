import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { learnerWithRoadmap } from "./fixtures";
import { get, json, makeApp } from "./helpers";
import { testDb } from "./setup";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};

export const questionFor: Record<string, object> = {
  fillGap: { block: "fillGap", prompt: "She ___ to work.", answer: "goes", explanation: "Third person takes -es." },
  multipleChoice: {
    block: "multipleChoice",
    prompt: "Pick one.",
    options: ["go", "goes"],
    answerIndex: 1,
    explanation: "He/she/it takes -es.",
  },
  matchPairs: {
    block: "matchPairs",
    prompt: "Match.",
    pairs: [
      { left: "I", right: "go" },
      { left: "she", right: "goes" },
    ],
    explanation: "Verb agrees.",
  },
  reorder: { block: "reorder", prompt: "Order.", answer: ["She", "goes", "home"], explanation: "Subject first." },
  rewrite: { block: "rewrite", prompt: "Rewrite: I goes.", expectedAnswer: "I go.", rubric: "Uses go for I." },
  speakPrompt: { block: "speakPrompt", prompt: "Say it.", expectedAnswer: "I go.", rubric: "Present simple." },
};

type PlanPage = { idea: string; vocabCard: boolean; questions: string[] };
export const plan = (...questions: string[][]): PlanPage[] =>
  questions.map((q, i) => ({ idea: `Idea ${i + 1}`, vocabCard: i === 1, questions: q }));
export const defaultPlan = plan(
  ["multipleChoice"],
  ["fillGap", "matchPairs"],
  ["reorder", "rewrite"],
  ["speakPrompt"],
  ["multipleChoice"],
);

export const good = (n: number) => ({
  title: `Page ${n}`,
  body: `Short reading ${n} about commuting.`,
  example: null,
  answerKey: null,
  keyTerms: ["Short", "reading"],
  glossary: [{ term: "commuting", definition: "travelling to work" }],
  vocab: n === 2 ? { term: "commute", meaning: "the trip to work" } : null,
});

/** Five fresh fill-the-gap questions for Practice Round call `n`. */
export const roundOf = (n: number) =>
  Array.from({ length: 5 }, (_, i) => ({
    block: "fillGap",
    prompt: `Round ${n} question ${i + 1}: he ___ home.`,
    answer: "goes",
    explanation: "He takes -es.",
  }));

/** Plays the planner, the Page writers and the Quiz writer. `plans(attempt)` can return a broken plan. */
export function fakeQuizModel({
  plans = (_attempt: number) => defaultPlan,
  quiz = (pages: any[]) => ({
    questions: pages.flatMap((p) =>
      p.questions.map((block: string) => ({ page: p.page, question: questionFor[block] })),
    ),
  }),
  rounds = (call: number) => ({ questions: roundOf(call) }),
}: {
  plans?: (attempt: number) => PlanPage[];
  quiz?: (pages: any[]) => object;
  rounds?: (call: number, body: any) => object;
} = {}) {
  const calls = { planner: 0, plans: [] as any[], writers: [] as any[], quiz: [] as any[], rounds: [] as any[] };
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      const system = JSON.stringify(options.prompt);
      const body = JSON.parse(options.prompt.at(-1).content[0].text);
      let reply: object;
      if (system.includes("Plan one short English Lesson")) {
        calls.planner++;
        calls.plans.push(body);
        reply = { focus: "Describe your routine.", keyExample: "Maya's commute", pages: plans(calls.planner) };
      } else if (system.includes("You check one English rewrite exercise")) {
        reply = { verdict: "almost", corrected: "I go.", explanation: "Use go with I." };
      } else if (system.includes("spoken answer")) {
        reply = { verdict: "correct", feedback: "Clear and on topic." };
      } else if (system.includes("You are an examiner")) {
        reply = { summary: "You mixed up go and goes.", focusItems: null, usedFocusItemIds: null };
      } else if (system.includes("Write a Practice Round")) {
        calls.rounds.push(body);
        reply = rounds(calls.rounds.length, body);
      } else if (system.includes("Write the Quiz")) {
        calls.quiz.push(body);
        reply = quiz(body.pages);
      } else {
        calls.writers.push({ ...body, system });
        reply = good(body.page);
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(reply) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage,
        warnings: [],
        response: { id: `resp-${crypto.randomUUID()}` },
      };
    },
  });
  return { model, calls };
}

export async function learner() {
  const l = await learnerWithRoadmap(undefined, {}, undefined, true);
  await testDb.delete(schema.lesson).where(eq(schema.lesson.userId, l.id));
  return l;
}
export const start = (app: any, cookie: string, p = 0) => app.request(`/api/lessons/${p}/start`, json({}, cookie));
export const pages = async (app: any, cookie: string, id: string) =>
  (await (await app.request(`/api/lessons/${id}/pages`, get(cookie))).json()) as any;
export const answer = (app: any, cookie: string, id: string, i: number, body: unknown) =>
  app.request(`/api/lessons/${id}/quiz/${i}/answer`, json({ answer: body }, cookie));

/** A started Lesson with its Pages and Quiz written. */
export async function readyLesson(fake = fakeQuizModel(), overrides: Parameters<typeof makeApp>[0] = {}) {
  const l = await learner();
  // The same fake plays the analysis that Next lesson and Learn more queue.
  const app = makeApp({ models: { step: fake.model, judge: fake.model }, ...overrides });
  const { id } = (await (await start(app, l.cookie)).json()) as any;
  await app.runJobs(l.id);
  return { ...l, app, lessonId: id, fake };
}
