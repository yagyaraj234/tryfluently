import { expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { get, json } from "./helpers";
import { answer, fakeQuizModel, pages, plan, readyLesson } from "./quiz-fixtures";
import { testDb } from "./setup";

const fillGaps = () => plan(["fillGap"], ["fillGap"], ["fillGap"], ["fillGap"], ["fillGap"]);
type T = Awaited<ReturnType<typeof readyLesson>>;

/** Answers a Lesson's whole Quiz, the first question wrong. */
async function answerQuiz(t: T, lessonId: string) {
  await answer(t.app, t.cookie, lessonId, 0, "go");
  for (const i of [1, 2, 3, 4]) await answer(t.app, t.cookie, lessonId, i, "goes");
}
const learnMore = (t: T, lessonId: string, note?: string) =>
  t.app.request(`/api/lessons/${lessonId}/learn-more`, json(note === undefined ? {} : { note }, t.cookie));
const roadmap = async (t: T) => (await (await t.app.request("/api/roadmap", get(t.cookie))).json()) as any[];

test("Learn more completes the Lesson, inserts a Follow-up Lesson right after it and starts it straight away", async () => {
  const t = await readyLesson(fakeQuizModel({ plans: fillGaps }));
  const [before] = await roadmap(t);
  await answerQuiz(t, t.lessonId);
  expect((await pages(t.app, t.cookie, t.lessonId)).learnMore).toBe(true);

  const res = await learnMore(t, t.lessonId, "I mix up go and goes");
  expect(res.status).toBe(201);
  const followUp = (await res.json()) as any;
  expect(followUp).toMatchObject({ position: 1, preparation: "preparing", status: "in_progress" });

  const [unit] = await roadmap(t);
  const original = before.lessonOutline[0];
  expect(unit.lessonOutline.map((p: any) => [p.position, p.title])).toEqual([
    [0, original.title],
    [1, `${original.title}: a second look`],
    ...before.lessonOutline.slice(1).map((p: any) => [p.position + 1, p.title]),
  ]);
  expect(unit.lessonOutline[1]).toMatchObject({ objective: original.objective, kind: "practice" });
  expect(unit.lessons.map((l: any) => [l.id, l.position, l.status])).toEqual([
    [t.lessonId, 0, "completed"],
    [followUp.id, 1, "in_progress"],
  ]);

  // Its planner is told it re-teaches the objective, with the wrong answers and the note.
  await t.app.runJobs(t.id);
  expect((await pages(t.app, t.cookie, followUp.id)).preparation).toBe("ready");
  const planned = t.fake.calls.plans.at(-1);
  expect(planned.lesson.objective).toBe(original.objective);
  expect(planned.followUp).toEqual({
    note: "I mix up go and goes",
    mistakes: [expect.objectContaining({ prompt: "She ___ to work.", answer: "go", correctAnswer: "goes" })],
  });
  const plannerSystem = t.fake.model.doGenerateCalls
    .map((c) => (c.prompt as any)[0].content as string)
    .findLast((x) => x.includes("Plan one short English Lesson"));
  expect(plannerSystem).toContain("Follow-up Lesson");
});

test("Learn more is only offered at the choice, and not from the second Follow-up Lesson in a chain", async () => {
  const t = await readyLesson(fakeQuizModel({ plans: fillGaps }));
  expect((await learnMore(t, t.lessonId)).status).toBe(409);
  await answerQuiz(t, t.lessonId);
  const first = (await (await learnMore(t, t.lessonId)).json()) as any;
  await t.app.runJobs(t.id);
  await answerQuiz(t, first.id);
  expect((await pages(t.app, t.cookie, first.id)).learnMore).toBe(true);
  const second = (await (await learnMore(t, first.id)).json()) as any;
  expect(second.position).toBe(2);
  await t.app.runJobs(t.id);
  await answerQuiz(t, second.id);
  expect((await pages(t.app, t.cookie, second.id)).learnMore).toBe(false);
  expect((await learnMore(t, second.id)).status).toBe(409);
  const [unit] = await roadmap(t);
  expect(unit.lessonOutline.slice(0, 3).map((p: any) => p.title.replace(unit.lessonOutline[0].title, "X"))).toEqual([
    "X",
    "X: a second look",
    "X: a third look",
  ]);
});

test("the Unit is mastered only once its Follow-up Lessons are completed too", async () => {
  const t = await readyLesson(fakeQuizModel({ plans: fillGaps }));
  // A Unit with only this Lesson left.
  const [active] = await testDb.select().from(schema.unit).where(eq(schema.unit.id, t.units[0].id));
  await testDb
    .update(schema.unit)
    .set({ lessonOutline: active!.lessonOutline.slice(0, 1) })
    .where(eq(schema.unit.id, active!.id));
  await answerQuiz(t, t.lessonId);
  const followUp = (await (await learnMore(t, t.lessonId)).json()) as any;
  expect((await roadmap(t))[0].status).toBe("active");

  await t.app.runJobs(t.id);
  await answerQuiz(t, followUp.id);
  expect((await t.app.request(`/api/lessons/${followUp.id}/finish`, json({}, t.cookie))).status).toBe(200);
  expect((await roadmap(t))[0].status).toBe("mastered");
});
