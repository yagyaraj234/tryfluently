import { expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { settleAnalyses } from "../src/speech-answers";
import { learnerWithRoadmap } from "./fixtures";
import { get, json, makeApp, mockModel } from "./helpers";
import { testDb } from "./setup";

const question = {
  block: "speakPrompt",
  prompt: "Describe your day.",
  expectedAnswer: "SECRET-SPEAK",
  rubric: "SECRET-RUBRIC",
};
const verdict = { verdict: "correct", feedback: "Clear ideas. Try 'went' for the past. Nice vocabulary." };

async function ready(model: any) {
  const l = await learnerWithRoadmap();
  await testDb.delete(schema.lesson).where(eq(schema.lesson.userId, l.id));
  const [created] = await testDb
    .insert(schema.lesson)
    .values({
      userId: l.id,
      unitId: l.units[0].id,
      position: 0,
      kind: "practice",
      title: "Speaking",
      objective: "Talk",
      phase: "learning",
      contentVersion: 2,
      preparation: "ready",
      pageStatus: [{ page: "ready" as const, question: "ready" as const }],
      material: [{ title: "P", body: "Body.", example: null, block: "speakPrompt", question }] as any,
      startedAt: new Date(),
    })
    .returning();
  const app = makeApp({ models: { step: model } });
  const base = `/api/lessons/${created!.id}`;
  return {
    id: created!.id,
    say: (text: string) => app.request(`${base}/pages/0/answer`, json({ answer: text }, l.cookie)),
    retry: () => app.request(`${base}/pages/0/analyse`, json({}, l.cookie)),
    read: async () => ((await (await app.request(`${base}/pages`, get(l.cookie))).json()) as any).pages[0].result,
  };
}

test("a spoken answer is saved at once, analysed in the background and the result lands on the Page", async () => {
  const model = mockModel(verdict);
  const t = await ready(model);
  const res = await t.say("I wake up and go to work.");
  expect(res.status).toBe(201);
  const first = (await res.json()) as any;
  expect(first).toMatchObject({ answer: "I wake up and go to work.", verdict: null, analysis: "analysing" });
  await settleAnalyses();
  expect(await t.read()).toMatchObject({ verdict: "correct", analysis: "done", explanation: verdict.feedback });
  // The recognizer warning and the rubric go to the model; neither comes back to the Learner.
  const sent = JSON.stringify(model.doGenerateCalls[0]!.prompt);
  expect(sent).toContain("auto-corrected");
  expect(sent).toContain("SECRET-RUBRIC");
  expect(JSON.stringify(await t.read())).not.toContain("SECRET");
  expect(JSON.stringify(first)).not.toContain("SECRET");
});

test("sending the answer again returns the first result and makes no second model call", async () => {
  const model = mockModel(verdict);
  const t = await ready(model);
  await t.say("First.");
  await settleAnalyses();
  const again = await t.say("Second.");
  expect(again.status).toBe(200);
  expect(await again.json()).toMatchObject({ answer: "First.", verdict: "correct", analysis: "done" });
  expect(model.doGenerateCalls).toHaveLength(1);
});

test("a model failure keeps the answer, and retry then analyses it", async () => {
  const ok = mockModel(verdict);
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      if (calls++ === 0) throw new Error("model down");
      return ok.doGenerate(options);
    },
  });
  const t = await ready(model);
  await t.say("Kept words.");
  await settleAnalyses();
  expect(await t.read()).toMatchObject({ answer: "Kept words.", verdict: null, analysis: "failed" });
  const retried = await t.retry();
  expect(retried.status).toBe(202);
  expect(((await retried.json()) as any).analysis).toBe("analysing");
  await settleAnalyses();
  expect(await t.read()).toMatchObject({ answer: "Kept words.", verdict: "correct", analysis: "done" });
  // Retrying a finished analysis changes nothing and calls nothing.
  expect(((await (await t.retry()).json()) as any).analysis).toBe("done");
  expect(calls).toBe(2);
  const rows = await testDb.select().from(schema.step).where(eq(schema.step.lessonId, t.id));
  expect(rows).toHaveLength(1);
});
