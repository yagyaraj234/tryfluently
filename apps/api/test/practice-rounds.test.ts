import { expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { and, eq } from "drizzle-orm";
import { get, json, makeClock } from "./helpers";
import { answer, fakeQuizModel, pages, plan, readyLesson, roundOf } from "./quiz-fixtures";
import { testDb } from "./setup";

const fillGaps = () => plan(["fillGap"], ["fillGap"], ["fillGap"], ["fillGap"], ["fillGap"]);
const practise = (t: { app: any; cookie: string; lessonId: string }) =>
  t.app.request(`/api/lessons/${t.lessonId}/practice`, json({}, t.cookie));

/** A ready Lesson whose Quiz is answered, with the first question wrong. */
async function atChoice(fake = fakeQuizModel({ plans: fillGaps }), now?: ReturnType<typeof makeClock>) {
  const t = await readyLesson(fake, now && { now });
  await answer(t.app, t.cookie, t.lessonId, 0, "go");
  for (const i of [1, 2, 3, 4]) await answer(t.app, t.cookie, t.lessonId, i, "goes");
  return t;
}

test("Practice more writes 5 new questions from the Pages and wrong answers, answered like the Quiz", async () => {
  const t = await atChoice();
  const res = await practise(t);
  expect(res.status).toBe(202);
  expect((await pages(t.app, t.cookie, t.lessonId)).practice).toBe("preparing");
  await t.app.runJobs(t.id);

  const view = await pages(t.app, t.cookie, t.lessonId);
  expect(view.practice).toBeNull();
  expect(view.quiz).toHaveLength(10);
  expect(view.quiz.slice(5).map((q: any) => [q.round, q.page, q.questionData.prompt])).toEqual(
    roundOf(1).map((q) => [1, null, q.prompt]),
  );
  // One call, given the Pages, the wrong answers and every question already asked.
  const [call] = t.fake.calls.rounds;
  expect(t.fake.calls.rounds).toHaveLength(1);
  expect(call.pages).toHaveLength(5);
  expect(call.pages[0].body).toBe("Short reading 1 about commuting.");
  expect(call.mistakes).toEqual([
    expect.objectContaining({ prompt: "She ___ to work.", answer: "go", correctAnswer: "goes" }),
  ]);
  expect(call.asked).toHaveLength(5);

  // Answered like the Quiz.
  expect(await (await answer(t.app, t.cookie, t.lessonId, 5, "goes")).json()).toMatchObject({ verdict: "correct" });
});

test("Practice answers count in the Lesson's scores and XP when it completes, and rounds repeat", async () => {
  const t = await atChoice();
  for (const round of [1, 2]) {
    expect((await practise(t)).status).toBe(202);
    await t.app.runJobs(t.id);
    for (let i = 0; i < 5; i++) await answer(t.app, t.cookie, t.lessonId, 5 * round + i, i < 3 ? "goes" : "go");
  }
  expect((await pages(t.app, t.cookie, t.lessonId)).quiz).toHaveLength(15);
  expect(t.fake.calls.rounds[1].asked).toHaveLength(10);
  expect((await t.app.request(`/api/lessons/${t.lessonId}/finish`, json({}, t.cookie))).status).toBe(200);
  const [grammar] = await testDb
    .select()
    .from(schema.skillScore)
    .where(and(eq(schema.skillScore.userId, t.id), eq(schema.skillScore.source, "lesson")));
  // Quiz 4 of 5 right, rounds 3 of 5 each: 10 of 15.
  expect(grammar!.result).toBeCloseTo((100 * 10) / 15);
  const progress = (await (await t.app.request("/api/progress", get(t.cookie))).json()) as any;
  expect(progress.xp).toBe(20 + 10 * 15);
});

test("a round that repeats an earlier question or breaks the rules is written again, and a failed round can be retried", async () => {
  const repeat = { block: "fillGap", prompt: "She ___ to work.", answer: "goes", explanation: "Again." };
  const twoGaps = { block: "fillGap", prompt: "She ___ to ___.", answer: "goes", explanation: "Two." };
  let healthy = false;
  const fake = fakeQuizModel({
    plans: fillGaps,
    rounds: (call) => ({
      questions: healthy ? roundOf(call) : [call === 2 ? twoGaps : repeat, ...roundOf(call).slice(1)],
    }),
  });
  const t = await atChoice(fake);
  await practise(t);
  await t.app.runJobs(t.id);
  expect((await pages(t.app, t.cookie, t.lessonId)).practice).toBe("failed");
  expect(fake.calls.rounds).toHaveLength(3);
  // Each retry is told why the last attempt was rejected.
  const systems = fake.model.doGenerateCalls
    .map((c) => (c.prompt as any)[0].content as string)
    .filter((x) => x.includes("Write a Practice Round"));
  expect(systems[1]).toContain("question 1 repeats an earlier question");
  expect(systems[2]).toContain("fillGap prompt must have exactly one gap");

  healthy = true;
  expect((await practise(t)).status).toBe(202);
  await t.app.runJobs(t.id);
  const view = await pages(t.app, t.cookie, t.lessonId);
  expect(view.practice).toBeNull();
  expect(view.quiz).toHaveLength(10);
});

test("Practice is only offered at the choice, before the Lesson completes", async () => {
  const fake = fakeQuizModel({ plans: fillGaps });
  const t = await readyLesson(fake);
  expect((await practise(t)).status).toBe(409);
  for (const i of [0, 1, 2, 3, 4]) await answer(t.app, t.cookie, t.lessonId, i, "goes");
  expect((await practise(t)).status).toBe(202);
  // A second press while the round is being written changes nothing.
  expect((await practise(t)).status).toBe(409);
  await t.app.runJobs(t.id);
  // Its questions are not answered yet, so neither another round nor Next lesson.
  expect((await practise(t)).status).toBe(409);
  for (let i = 5; i < 10; i++) await answer(t.app, t.cookie, t.lessonId, i, "goes");
  expect((await t.app.request(`/api/lessons/${t.lessonId}/finish`, json({}, t.cookie))).status).toBe(200);
  expect((await practise(t)).status).toBe(409);
});

test("Next lesson waits while a Practice Round is being written", async () => {
  const t = await atChoice();
  expect((await practise(t)).status).toBe(202);
  expect((await t.app.request(`/api/lessons/${t.lessonId}/finish`, json({}, t.cookie))).status).toBe(409);
  await t.app.runJobs(t.id);
  for (let i = 5; i < 10; i++) await answer(t.app, t.cookie, t.lessonId, i, "goes");
  expect((await t.app.request(`/api/lessons/${t.lessonId}/finish`, json({}, t.cookie))).status).toBe(200);
});

test("questions that share a general instruction but ask different things are not repeats", async () => {
  const match = (left: string, right: string) => ({
    block: "matchPairs",
    prompt: "Match each word to its meaning.",
    pairs: [
      { left, right },
      { left: `${left}s`, right: `more ${right}` },
    ],
    explanation: "Meanings.",
  });
  const fake = fakeQuizModel({
    plans: fillGaps,
    rounds: (call) => ({ questions: [match("commute", "trip"), match("rush", "hurry"), ...roundOf(call).slice(2)] }),
  });
  const t = await atChoice(fake);
  await practise(t);
  await t.app.runJobs(t.id);
  expect((await pages(t.app, t.cookie, t.lessonId)).quiz).toHaveLength(10);
  expect(fake.calls.rounds).toHaveLength(1);
});
