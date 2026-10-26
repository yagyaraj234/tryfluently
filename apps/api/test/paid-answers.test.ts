import { expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { PAID_REQUESTS_IN_FLIGHT, PAID_REQUESTS_PER_MINUTE } from "../src/request-limits";
import { settleAnalyses } from "../src/speech-answers";
import { get, json, makeApp, makeClock, mockModel, signUp } from "./helpers";
import { testDb } from "./setup";

const spoken = {
  block: "speakPrompt",
  prompt: "Describe your day.",
  expectedAnswer: "I worked.",
  rubric: "Give details.",
};
const rewrite = {
  block: "rewrite",
  prompt: "Fix: She go to work.",
  expectedAnswer: "She goes to work.",
  rubric: "Use agreement.",
};
const feedback = { verdict: "correct", feedback: "Clear ideas and useful vocabulary." };

async function ready(model: MockLanguageModelV4, question = spoken) {
  const app = makeApp({ models: { step: model } });
  const learner = await signUp(app);
  const [row] = await testDb
    .insert(schema.lesson)
    .values({
      userId: learner.id,
      position: 0,
      kind: "practice",
      title: "Practice",
      objective: "Talk",
      contentVersion: 2,
      preparation: "ready",
      pageStatus: Array.from({ length: 6 }, () => ({ page: "ready" as const, question: "ready" as const })),
      material: Array.from({ length: 6 }, () => ({
        title: "Page",
        body: "Body.",
        example: null,
        block: question.block,
        question,
      })),
    })
    .returning();
  const base = `/api/lessons/${row!.id}`;
  return {
    id: row!.id,
    answer: (index: number) =>
      app.request(`${base}/pages/${index}/answer`, json({ answer: "I worked today." }, learner.cookie)),
    retry: (index: number) => app.request(`${base}/pages/${index}/analyse`, json({}, learner.cookie)),
    read: () => app.request(`${base}/pages`, get(learner.cookie)),
  };
}

for (const block of ["speakPrompt", "rewrite"] as const) {
  test(`${block}: four paid checks block a fifth until their work finishes`, async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const ok = mockModel(
      ...Array(6).fill(
        block === "speakPrompt"
          ? feedback
          : {
              verdict: "correct",
              corrected: "She goes to work.",
              explanation: "Use agreement.",
            },
      ),
    );
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        if (++calls === PAID_REQUESTS_IN_FLIGHT) entered.resolve();
        await release.promise;
        return ok.doGenerate(options);
      },
    });
    const t = await ready(model, block === "speakPrompt" ? spoken : rewrite);
    const pending = Array.from({ length: PAID_REQUESTS_IN_FLIGHT }, (_, i) => t.answer(i));
    try {
      await entered.promise;
      if (block === "speakPrompt") expect((await Promise.all(pending)).every((r) => r.status === 201)).toBe(true);
      expect((await t.answer(4)).status).toBe(429);
      expect(calls).toBe(PAID_REQUESTS_IN_FLIGHT);
      expect((await t.read()).status).toBe(200);
    } finally {
      release.resolve();
      expect((await Promise.all(pending)).every((r) => r.status === 201)).toBe(true);
      await settleAnalyses();
    }
    expect((await t.answer(4)).status).toBe(201);
    await settleAnalyses();
    expect(calls).toBe(PAID_REQUESTS_IN_FLIGHT + 1);
  });
}

test("failed background checks release slots; retries retain them until they settle", async () => {
  let calls = 0;
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const ok = mockModel(...Array(6).fill(feedback));
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (++calls <= PAID_REQUESTS_IN_FLIGHT) throw new Error("synthetic analysis failure");
      if (calls === PAID_REQUESTS_IN_FLIGHT * 2) entered.resolve();
      await release.promise;
      return ok.doGenerate(options);
    },
  });
  const t = await ready(model);
  for (let i = 0; i < PAID_REQUESTS_IN_FLIGHT; i++) expect((await t.answer(i)).status).toBe(201);
  await settleAnalyses();
  try {
    const retries = await Promise.all(Array.from({ length: PAID_REQUESTS_IN_FLIGHT }, (_, i) => t.retry(i)));
    expect(retries.every((r) => r.status === 202)).toBe(true);
    await entered.promise;
    expect((await t.answer(4)).status).toBe(429);
  } finally {
    release.resolve();
    await settleAnalyses();
  }
  expect((await t.answer(4)).status).toBe(201);
  await settleAnalyses();
});

test("overlapping retries and stale markers never duplicate a running speech check", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const ok = mockModel(feedback);
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (++calls === 1) throw new Error("synthetic first failure");
      entered.resolve();
      await release.promise;
      return ok.doGenerate(options);
    },
  });
  const t = await ready(model);
  await t.answer(0);
  await settleAnalyses();
  try {
    const replies = await Promise.all([t.retry(0), t.retry(0), t.retry(0)]);
    expect(replies.every((r) => r.status === 202)).toBe(true);
    await entered.promise;
    expect(calls).toBe(2);
    const [row] = await testDb.select().from(schema.step).where(eq(schema.step.lessonId, t.id));
    await testDb
      .update(schema.step)
      .set({
        output: {
          ...row!.output,
          analysis: { state: "analysing", at: Date.now() - 61_000 },
        },
      })
      .where(eq(schema.step.id, row!.id));
    expect((await t.retry(0)).status).toBe(202);
    expect(calls).toBe(2);
  } finally {
    release.resolve();
    await settleAnalyses();
  }
});

test("Page answers use the one-minute rate window and reset with it", async () => {
  const clock = makeClock();
  const app = makeApp({ now: clock });
  const learner = await signUp(app);
  const answer = () => app.request("/api/lessons/missing/pages/0/answer", json({ answer: "x" }, learner.cookie));
  for (let i = 0; i < PAID_REQUESTS_PER_MINUTE; i++) expect((await answer()).status).toBe(404);
  expect((await answer()).status).toBe(429);
  clock.advance({ minutes: 1 });
  expect((await answer()).status).toBe(404);
});
