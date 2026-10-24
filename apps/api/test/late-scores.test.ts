import { expect, test } from "bun:test";
import { schema, type Skill } from "@fluently/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { recordScores, reconcileLessonScores, skillProfile } from "../src/scoring";
import { settleAnalyses } from "../src/speech-answers";
import { learnerWithRoadmap } from "./fixtures";
import { json, makeApp, mockModel } from "./helpers";
import { testDb } from "./setup";

const speak = {
  block: "speakPrompt" as const,
  prompt: "Describe your day.",
  expectedAnswer: "A clear description.",
  rubric: "Clear ideas.",
};
const rewrite = {
  block: "rewrite" as const,
  prompt: "Rewrite: I goes.",
  expectedAnswer: "I go.",
  rubric: "Uses go for I.",
};
const correct = { verdict: "correct", feedback: "Clear ideas." };

async function ready(questions: object[], model: MockLanguageModelV4, alphaLesson = 0.15) {
  const learner = await learnerWithRoadmap();
  const [row] = await testDb
    .insert(schema.lesson)
    .values({
      userId: learner.id,
      unitId: learner.units[0].id,
      position: 10,
      kind: "practice",
      title: "Late feedback",
      objective: "Use clear sentences",
      contentVersion: 2,
      preparation: "ready",
      pageStatus: questions.map(() => ({ page: "ready" as const, question: "ready" as const })),
      material: questions.map((question: any) => ({
        title: "Page",
        body: "Body",
        example: null,
        block: question.block,
        question,
      })) as any,
      startedAt: new Date(),
    })
    .returning();
  const app = makeApp({ models: { step: model }, settings: { alphaLesson } });
  const base = `/api/lessons/${row!.id}`;
  return {
    userId: learner.id,
    id: row!.id,
    answer: (index: number, answer: unknown = "I go to work.") =>
      app.request(`${base}/pages/${index}/answer`, json({ answer }, learner.cookie)),
    retry: (index: number) => app.request(`${base}/pages/${index}/analyse`, json({}, learner.cookie)),
    finish: () => app.request(`${base}/finish`, json({}, learner.cookie)),
  };
}

const scores = (userId: string, skill: Skill) =>
  testDb
    .select()
    .from(schema.skillScore)
    .where(and(eq(schema.skillScore.userId, userId), eq(schema.skillScore.skill, skill)))
    .orderBy(asc(schema.skillScore.sequence));

test("Finish stays instant and a delayed spoken verdict records fluency once", async () => {
  const entered = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  const response = mockModel(correct);
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      entered.resolve();
      await gate.promise;
      return response.doGenerate(options);
    },
  });
  const t = await ready([speak], model);
  await t.answer(0);
  await entered.promise;
  try {
    expect(await (await t.finish()).json()).toEqual({ status: "completed" });
    expect(await scores(t.userId, "fluency")).toHaveLength(0);
  } finally {
    gate.resolve();
    await settleAnalyses();
  }
  const measured = await scores(t.userId, "fluency");
  expect(measured).toHaveLength(1);
  expect(measured[0]).toMatchObject({ sourceId: t.id, score: 100, result: 100 });
  await Promise.all([t.finish(), t.finish(), t.retry(0)]);
  await settleAnalyses();
  expect(await scores(t.userId, "fluency")).toEqual(measured);
  expect(model.doGenerateCalls).toHaveLength(1);
});

test("failed speech stays unmeasured until a successful retry after Finish", async () => {
  let fail = true;
  const response = mockModel(correct);
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      if (fail) throw new Error("model down");
      return response.doGenerate(options);
    },
  });
  const t = await ready([speak], model);
  await t.answer(0);
  await settleAnalyses();
  await t.finish();
  expect(await scores(t.userId, "fluency")).toHaveLength(0);
  fail = false;
  expect((await t.retry(0)).status).toBe(202);
  await settleAnalyses();
  const measured = await scores(t.userId, "fluency");
  expect(measured).toHaveLength(1);
  expect(measured[0]).toMatchObject({ sourceId: t.id, result: 100, score: 100 });
  await t.retry(0);
  await t.finish();
  expect(await scores(t.userId, "fluency")).toEqual(measured);
});

test("a failed rewrite preserves ready grammar, then retry revises one measurement and later averages", async () => {
  let fail = true;
  const response = mockModel({ verdict: "correct", corrected: "I go.", explanation: "Use go for I." });
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      if (fail) throw new Error("model down");
      return response.doGenerate(options);
    },
  });
  const t = await ready(
    [{ block: "fillGap", prompt: "She ___.", answer: "goes", explanation: "Use goes." }, rewrite],
    model,
    0.2,
  );
  await t.answer(0, "go");
  expect((await t.answer(1)).status).toBe(502);
  await t.finish();
  const initial = await scores(t.userId, "grammar");
  expect(initial.at(-1)).toMatchObject({ sourceId: t.id, result: 0 });
  const beforeLesson = initial.at(-2)!.score;
  const append = (source: "assessment" | "lesson", alpha: number, result: number) =>
    testDb.transaction(async (tx) => {
      await tx.select().from(schema.user).where(eq(schema.user.id, t.userId)).for("update");
      await recordScores(
        tx,
        t.userId,
        { grammar: result },
        { alpha, source, sourceId: crypto.randomUUID(), at: new Date() },
      );
    });
  await append("assessment", 0.7, 80);
  await append("lesson", 0.3, 20);
  fail = false;
  expect((await t.answer(1, "ignored resubmit")).status).toBe(201);
  const rows = await scores(t.userId, "grammar");
  expect(rows.filter((r) => r.sourceId === t.id)).toHaveLength(1);
  const revised = beforeLesson + 0.2 * (50 - beforeLesson);
  expect(rows.at(-3)!.alpha).toBe(0.2);
  expect(rows.at(-3)!.score).toBeCloseTo(revised, 5);
  const assessment = revised + 0.7 * (80 - revised);
  expect(rows.at(-2)!.alpha).toBe(0.7);
  expect(rows.at(-2)!.score).toBeCloseTo(assessment, 5);
  expect(rows.at(-1)!.alpha).toBe(0.3);
  expect(rows.at(-1)!.score).toBeCloseTo(assessment + 0.3 * (20 - assessment), 5);
  expect((await skillProfile(testDb, t.userId)).grammar?.score).toBe(Math.round(rows.at(-1)!.score));
  await Promise.all([t.finish(), t.answer(1), t.finish()]);
  expect(await scores(t.userId, "grammar")).toEqual(rows);
});

test("simultaneous speech grades and Finish blend the Lesson once", async () => {
  const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  const entered = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
  let call = 0;
  const response = mockModel(correct, { verdict: "incorrect", feedback: "Add a clear example." });
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      const index = call++;
      entered[index]!.resolve();
      await gates[index]!.promise;
      return response.doGenerate(options);
    },
  });
  const t = await ready([speak, speak], model);
  await t.answer(0);
  await t.answer(1);
  await Promise.all(entered.map((e) => e.promise));
  try {
    const finishing = t.finish();
    gates.forEach((g) => g.resolve());
    expect((await finishing).status).toBe(200);
  } finally {
    gates.forEach((g) => g.resolve());
    await settleAnalyses();
  }
  expect(await scores(t.userId, "fluency")).toHaveLength(1);
  expect((await scores(t.userId, "fluency"))[0]).toMatchObject({ result: 50, score: 50 });
});

test("saving the next Page waits for the Learner lock before locking the Lesson", async () => {
  const entered = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  const response = mockModel(correct);
  const model = new MockLanguageModelV4({
    doGenerate: async (options: any) => {
      entered.resolve();
      await gate.promise;
      return response.doGenerate(options);
    },
  });
  const t = await ready(
    [speak, { block: "fillGap", prompt: "She ___.", answer: "goes", explanation: "Use goes." }],
    model,
  );
  await t.answer(0);
  await entered.promise;
  let answering!: ReturnType<typeof t.answer>;
  try {
    await testDb.transaction(async (tx) => {
      await tx.select().from(schema.user).where(eq(schema.user.id, t.userId)).for("update");
      answering = t.answer(1, "goes");
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await tx.execute(sql`select exists (
          select 1 from pg_stat_activity where pg_blocking_pids(pid) @> array[pg_backend_pid()]
        ) as waiting`);
        if (row!.waiting) {
          waiting = true;
          break;
        }
        await Bun.sleep(5);
      }
      expect(waiting).toBe(true);
      // The Page writer must not hold this while it waits for our Learner lock.
      await tx.select().from(schema.lesson).where(eq(schema.lesson.id, t.id)).for("update", { noWait: true });
      gate.resolve();
    });
    expect((await answering).status).toBe(201);
    expect((await t.finish()).status).toBe(200);
  } finally {
    gate.resolve();
    await settleAnalyses();
  }
  expect((await scores(t.userId, "fluency"))[0]!.result).toBe(100);
});

test("historical rows stay fixed checkpoints during reconciliation", async () => {
  const t = await ready([], mockModel(correct));
  await testDb.insert(schema.skillScore).values([
    {
      userId: t.userId,
      skill: "fluency",
      score: 20,
      source: "lesson",
      sourceId: "historical",
      createdAt: new Date(),
    },
  ]);
  await testDb.transaction(async (tx) => {
    await recordScores(
      tx,
      t.userId,
      { fluency: 100 },
      { alpha: 0.2, source: "lesson", sourceId: t.id, at: new Date() },
    );
    await testDb.insert(schema.skillScore).values({
      userId: t.userId,
      skill: "fluency",
      score: 60,
      source: "assessment",
      sourceId: "checkpoint",
      createdAt: new Date(),
    });
    await recordScores(
      tx,
      t.userId,
      { fluency: 100 },
      { alpha: 0.5, source: "lesson", sourceId: "later", at: new Date() },
    );
    await reconcileLessonScores(tx, t.userId, t.id, { fluency: 0 }, 0.2, new Date());
  });
  expect((await scores(t.userId, "fluency")).map((r) => r.score)).toEqual([20, 16, 60, 80]);
});
