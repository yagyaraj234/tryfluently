import { expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { and, eq } from "drizzle-orm";
import { get, json, makeApp, makeClock } from "./helpers";
import { answer, defaultPlan, fakeQuizModel, learner, pages, plan, readyLesson, start } from "./quiz-fixtures";
import { testDb } from "./setup";
import { settleAnalyses } from "../src/speech-answers";

test("a new Lesson's Pages only teach, and its Quiz is written from the finished Pages", async () => {
  const { app, cookie, lessonId, fake } = await readyLesson();
  const whole = (await (await app.request(`/api/lessons/${lessonId}`, get(cookie))).json()) as any;
  expect(whole.contentVersion).toBe(3);

  const view = await pages(app, cookie, lessonId);
  expect(view.preparation).toBe("ready");
  expect(view.pages.map((p: any) => [p.status, p.block, p.questionData])).toEqual(
    Array(5).fill(["ready", undefined, undefined]),
  );
  expect(view.pages[1].vocab).toEqual({ term: "commute", meaning: "the trip to work" });
  expect(view.pages[0].vocab).toBeUndefined();
  expect(view.quiz.map((q: any) => [q.page, q.questionData.block])).toEqual([
    [0, "multipleChoice"],
    [1, "fillGap"],
    [1, "matchPairs"],
    [2, "reorder"],
    [2, "rewrite"],
    [3, "speakPrompt"],
    [4, "multipleChoice"],
  ]);
  expect(JSON.stringify(view)).not.toContain("Third person");
  expect(JSON.stringify(view)).not.toContain("answerIndex");

  // Writers get the idea, never a question Block; a vocab card only where the plan asks for one.
  expect(fake.calls.writers).toHaveLength(5);
  for (const w of fake.calls.writers) {
    expect(w.block).toBeUndefined();
    expect(w.system).not.toContain("fillGap");
    expect(w.vocabCard).toBe(w.page === 2);
  }
  // The Quiz writer ran once, on the finished Pages and the planned questions.
  expect(fake.calls.quiz).toHaveLength(1);
  expect(fake.calls.quiz[0].pages[1]).toMatchObject({
    page: 1,
    body: "Short reading 2 about commuting.",
    questions: ["fillGap", "matchPairs"],
  });
});

test("a plan that gives a Page no questions, more than 3, or more than 10 in all is planned again", async () => {
  const clock = makeClock();
  const three = ["fillGap", "fillGap", "fillGap"];
  const broken = [
    plan([], ["fillGap"], ["fillGap"], ["fillGap"], ["fillGap"]),
    plan([...three, "fillGap"], ["fillGap"], ["fillGap"], ["fillGap"], ["fillGap"]),
    plan(three, three, three, ["fillGap"], ["fillGap"]),
  ];
  const fake = fakeQuizModel({ plans: (attempt) => broken[attempt - 1] ?? defaultPlan });
  const l = await learner();
  const app = makeApp({ models: { step: fake.model }, now: clock });
  const { id } = (await (await start(app, l.cookie)).json()) as any;
  for (let i = 0; i < 2; i++) {
    await app.runJobs(l.id);
    expect((await pages(app, l.cookie, id)).preparation).toBe("preparing");
    clock.advance({ minutes: 1 });
  }
  await app.runJobs(l.id);
  // The third broken plan used up the job's attempts.
  expect((await pages(app, l.cookie, id)).preparation).toBe("failed");
  expect(fake.calls.writers).toHaveLength(0);
  expect((await app.request(`/api/lessons/${id}/retry`, json({}, l.cookie))).status).toBe(202);
  await app.runJobs(l.id);
  expect((await pages(app, l.cookie, id)).preparation).toBe("ready");
  expect(fake.calls.planner).toBe(4);
});

test("Quiz answers are graded and saved one by one, and Finish waits for every answer", async () => {
  const fake = fakeQuizModel({
    plans: () => plan(["multipleChoice"], ["fillGap"], ["fillGap"], ["matchPairs"], ["reorder"]),
  });
  const { app, cookie, lessonId, id: userId } = await readyLesson(fake);
  const first = await answer(app, cookie, lessonId, 0, 1);
  expect(first.status).toBe(201);
  expect(await first.json()).toMatchObject({ verdict: "correct" });
  expect(await (await answer(app, cookie, lessonId, 1, "go")).json()).toMatchObject({ verdict: "incorrect" });
  expect((await app.request(`/api/lessons/${lessonId}/finish`, json({}, cookie))).status).toBe(409);
  await answer(app, cookie, lessonId, 2, "goes");
  await answer(app, cookie, lessonId, 3, [
    { left: "I", right: "go" },
    { left: "she", right: "goes" },
  ]);
  await answer(app, cookie, lessonId, 4, ["She", "goes", "home"]);

  const view = await pages(app, cookie, lessonId);
  expect(view.quiz.map((q: any) => q.result.verdict)).toEqual([
    "correct",
    "incorrect",
    "correct",
    "correct",
    "correct",
  ]);
  expect(view.quiz[1].result).toMatchObject({
    answer: "go",
    correctAnswer: "goes",
    explanation: "Third person takes -es.",
  });

  expect((await app.request(`/api/lessons/${lessonId}/finish`, json({}, cookie))).status).toBe(200);
  const scores = await testDb
    .select()
    .from(schema.skillScore)
    .where(and(eq(schema.skillScore.userId, userId), eq(schema.skillScore.source, "lesson")));
  // Grammar: 3 of 4 right; vocabulary: the pairs.
  expect(Object.fromEntries(scores.map((s) => [s.skill, s.result]))).toEqual({ grammar: 75, vocabulary: 100 });
  const progress = (await (await app.request("/api/progress", get(cookie))).json()) as any;
  expect(progress.xp).toBe(20 + 10 * 5);
});

test("rewrite and spoken Quiz answers are saved, then checked, and the results show them once their feedback arrives", async () => {
  const fake = fakeQuizModel({
    plans: () => plan(["rewrite"], ["speakPrompt"], ["fillGap"], ["fillGap"], ["fillGap"]),
  });
  const { app, cookie, lessonId } = await readyLesson(fake);
  expect(await (await answer(app, cookie, lessonId, 0, "I goes.")).json()).toMatchObject({
    verdict: "almost",
    correctAnswer: "I go.",
  });
  const spoken = await answer(app, cookie, lessonId, 1, "I go to work at nine.");
  expect(await spoken.json()).toMatchObject({ verdict: null, analysis: "analysing" });
  await settleAnalyses();
  const view = await pages(app, cookie, lessonId);
  expect(view.quiz[1].result).toMatchObject({
    verdict: "correct",
    analysis: "done",
    explanation: "Clear and on topic.",
  });
});
