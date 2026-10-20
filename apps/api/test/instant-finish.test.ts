import { expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { and, eq } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { waitForAnalysis } from "../src/lesson-analysis";
import { scoresFromVerdicts } from "../src/paged-finish";
import { learnerWithRoadmap } from "./fixtures";
import { get, json, makeApp } from "./helpers";
import { testDb } from "./setup";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const explanation = "Because.";
const questions = [
  null,
  { block: "vocabCard", term: "commute", answer: "daily trip to work", explanation },
  { block: "fillGap", prompt: "She ___ to work.", answer: "goes", explanation },
  { block: "multipleChoice", prompt: "Pick.", options: ["go", "goes"], answerIndex: 1, explanation },
  {
    block: "matchPairs",
    prompt: "Match.",
    pairs: [
      { left: "I", right: "go" },
      { left: "she", right: "goes" },
    ],
    explanation,
  },
  { block: "reorder", prompt: "Order.", answer: ["She", "goes", "home"], explanation },
];

const reply = (body: object) => ({
  content: [{ type: "text" as const, text: JSON.stringify(body) }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
  response: { id: `resp-${crypto.randomUUID()}` },
});
const analysisModel = (focus: { label: string; kind: string }[] = []) => {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      calls++;
      return reply({ summary: "You used goes well.", focusItems: focus, usedFocusItemIds: [] });
    },
  });
  return { model, calls: () => calls };
};
const brokenModel = () => {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      calls++;
      throw new Error("model down");
    },
  });
  return { model, calls: () => calls };
};

async function ready(models: Parameters<typeof makeApp>[0] = {}) {
  const l = await learnerWithRoadmap();
  await testDb.delete(schema.lesson).where(eq(schema.lesson.userId, l.id));
  const [created] = await testDb
    .insert(schema.lesson)
    .values({
      userId: l.id,
      unitId: l.units[0].id,
      position: 0,
      kind: "practice",
      title: "Present simple",
      objective: "Use it",
      phase: "learning",
      contentVersion: 2,
      preparation: "ready",
      pageStatus: questions.map(() => ({ page: "ready" as const, question: "ready" as const })),
      material: questions.map((question, i) => ({
        title: `Page ${i}`,
        body: "Body.",
        example: null,
        block: question?.block ?? "reading",
        ...(question && { question }),
      })) as any,
      startedAt: new Date(),
    })
    .returning();
  const t = { ...l, lessonId: created!.id, app: makeApp(models) };
  const answers: [number, unknown][] = [
    [1, "seen"],
    [2, "goes"], // right
    [3, 0], // wrong
    [
      4,
      [
        { left: "I", right: "go" },
        { left: "she", right: "go" },
      ],
    ], // wrong
    [5, ["She", "goes", "home"]], // right
  ];
  for (const [page, answer] of answers)
    await t.app.request(`/api/lessons/${t.lessonId}/pages/${page}/answer`, json({ answer }, t.cookie));
  return t;
}
const finish = (t: Awaited<ReturnType<typeof ready>>) =>
  t.app.request(`/api/lessons/${t.lessonId}/finish`, json({}, t.cookie));
const jobs = (userId: string) =>
  testDb
    .select()
    .from(schema.assessmentJob)
    .where(and(eq(schema.assessmentJob.userId, userId), eq(schema.assessmentJob.kind, "lesson_analysis")));
const lessonScores = (userId: string) =>
  testDb
    .select()
    .from(schema.skillScore)
    .where(and(eq(schema.skillScore.userId, userId), eq(schema.skillScore.source, "lesson")));

test("finishing completes the Lesson, moves scores and queues the analysis even when every model is down", async () => {
  const down = brokenModel();
  const t = await ready({ models: { judge: down.model, step: down.model } });
  const res = await finish(t);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "completed" });
  const [row] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, t.lessonId));
  expect(row).toMatchObject({ status: "completed", summary: null });
  expect(row!.completedAt).not.toBeNull();
  expect(down.calls()).toBe(0);
  // Grammar: 1 of 3 right (fillGap, reorder right; multipleChoice wrong). Vocabulary: matchPairs wrong.
  const scores = await lessonScores(t.id);
  expect(scores.map((s) => s.skill).sort()).toEqual(["grammar", "vocabulary"]);
  expect((await jobs(t.id)).map((j) => j.status)).toEqual(["pending"]);
});

test("a Lesson whose questions aren't written yet can't be finished", async () => {
  const t = await ready();
  await testDb.delete(schema.step).where(eq(schema.step.lessonId, t.lessonId));
  const [row] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, t.lessonId));
  await testDb
    .update(schema.lesson)
    .set({
      pageStatus: row!.pageStatus!.map((s) => ({ ...s, question: "pending" as const })),
      material: row!.material!.map(({ question, ...page }: any) => page),
    })
    .where(eq(schema.lesson.id, t.lessonId));
  expect((await finish(t)).status).toBe(409);
  const [after] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, t.lessonId));
  expect(after!.status).toBe("in_progress");
  expect(await lessonScores(t.id)).toHaveLength(0);
});

test("finishing an abandoned Lesson reports abandoned, not completed", async () => {
  const t = await ready();
  await testDb.update(schema.lesson).set({ status: "abandoned" }).where(eq(schema.lesson.id, t.lessonId));
  const res = await finish(t);
  expect(await res.json()).toMatchObject({ status: "abandoned" });
  expect(res.status).toBe(409);
  const [row] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, t.lessonId));
  expect(row!.status).toBe("abandoned");
  expect(await jobs(t.id)).toHaveLength(0);
});

test("the next Lesson unlocks at once", async () => {
  const t = await ready({ models: { judge: brokenModel().model } });
  await finish(t);
  const [first] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, t.lessonId));
  expect(first!.status).toBe("completed");
});

test("finishing twice queues one analysis and records scores once", async () => {
  const t = await ready();
  await finish(t);
  const before = (await lessonScores(t.id)).length;
  expect((await finish(t)).status).toBe(200);
  expect(await jobs(t.id)).toHaveLength(1);
  expect(await lessonScores(t.id)).toHaveLength(before);
});

test("the analysis job writes the summary, Focus Items and Learner Memory, and runs once", async () => {
  const fake = analysisModel([{ label: "goes after she", kind: "grammar" }]);
  const t = await ready({ models: { judge: fake.model } });
  await finish(t);
  const status = async () =>
    (await (await t.app.request(`/api/lessons/${t.lessonId}/analysis`, get(t.cookie))).json()) as any;
  expect(await status()).toEqual({ status: "pending", summary: null });
  await t.app.runJobs(t.id);
  expect(await status()).toEqual({ status: "done", summary: "You used goes well." });
  const focus = await testDb.select().from(schema.focusItem).where(eq(schema.focusItem.userId, t.id));
  expect(focus.filter((f) => f.sourceId === t.lessonId).map((f) => f.label)).toEqual(["goes after she"]);
  const [memory] = await testDb.select().from(schema.learnerMemory).where(eq(schema.learnerMemory.userId, t.id));
  expect(memory!.summary).toContain("Present simple: You used goes well.");
  await finish(t);
  await t.app.runJobs(t.id);
  expect(fake.calls()).toBe(1);
});

test("a failing analysis retries without blocking, and a failed one can be queued again by finishing", async () => {
  const down = brokenModel();
  const t = await ready({ models: { judge: down.model } });
  await finish(t);
  await t.app.runJobs(t.id);
  expect((await jobs(t.id))[0]).toMatchObject({ status: "pending", attempts: 1 });
  await testDb
    .update(schema.assessmentJob)
    .set({ status: "failed", attempts: 3 })
    .where(eq(schema.assessmentJob.userId, t.id));
  const res = await t.app.request(`/api/lessons/${t.lessonId}/analysis`, get(t.cookie));
  expect(await res.json()).toEqual({ status: "failed", summary: null });
  await finish(t);
  expect((await jobs(t.id))[0]).toMatchObject({ status: "pending", attempts: 0 });
});

// A clock the test moves by sleeping, so waiting takes no real time.
const fakeClock = (onSleep: () => Promise<void> | void = () => {}) => {
  let t = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
      await onSleep();
    },
  };
};

test("the planner wait ends as soon as the analysis finishes within 5 seconds", async () => {
  const t = await ready();
  await finish(t);
  const clock = fakeClock(async () => {
    if (clock.now() >= 1000)
      await testDb.update(schema.assessmentJob).set({ status: "done" }).where(eq(schema.assessmentJob.userId, t.id));
  });
  expect(await waitForAnalysis(testDb, t.id, { clock })).toBe(true);
  expect(clock.now()).toBe(1000);
});

test("the planner wait gives up after 5 seconds and carries on", async () => {
  const t = await ready();
  await finish(t);
  const clock = fakeClock();
  expect(await waitForAnalysis(testDb, t.id, { clock })).toBe(false);
  expect(clock.now()).toBe(5000);
});

test("the planner waits for the previous analysis and then plans with its memory", async () => {
  const t = await ready({ models: { judge: analysisModel().model } });
  await finish(t);
  const prompts: string[] = [];
  const planner = new MockLanguageModelV4({
    doGenerate: async (o: any) => {
      prompts.push(JSON.stringify(o.prompt));
      throw new Error("stop after reading the prompt");
    },
  });
  const [next] = await testDb
    .insert(schema.lesson)
    .values({
      userId: t.id,
      unitId: t.units[0].id,
      position: 1,
      kind: "practice",
      title: "Next",
      objective: "Next",
      contentVersion: 2,
      preparation: "preparing",
      preparationToken: "tok",
      pageStatus: [{ page: "pending", question: "pending" }],
      material: [{ title: "", body: "", example: null }],
    })
    .returning();
  const { generateLesson } = await import("../src/paged-lessons");
  // The worker runs the analysis job while the planner sleeps.
  const clock = fakeClock(async () => {
    await t.app.runJobs(t.id);
  });
  const ctx = { db: testDb, now: () => new Date(), models: { step: planner } as any, clock };
  await expect(generateLesson(ctx, next!.id, 1)).rejects.toThrow();
  expect(clock.sleeps).toHaveLength(1);
  expect(prompts[0]).toContain("You used goes well.");
});

test("scores come only from graded answers", () => {
  const f = (verdict?: string) => (verdict ? { verdict } : null);
  expect(
    scoresFromVerdicts([
      { type: "vocabCard", feedback: f("correct") },
      { type: "fillGap", feedback: f("correct") },
      { type: "multipleChoice", feedback: f("incorrect") },
      { type: "rewrite", feedback: f() },
      { type: "speakPrompt", feedback: f() },
      { type: "matchPairs", feedback: f("almost") },
    ]),
  ).toEqual({ grammar: 50, vocabulary: 50 });
  expect(scoresFromVerdicts([{ type: "rewrite", feedback: null }])).toEqual({});
});

// Adds a Rewrite page and a Speaking page to a ready Lesson, already answered.
async function withRewriteAndSpeaking(
  t: Awaited<ReturnType<typeof ready>>,
  rewrite: "correct" | "almost" | "incorrect",
  speaking: "correct" | "incorrect" | null,
) {
  const base = { prompt: "Say it.", expectedAnswer: "She goes.", rubric: "Right verb." };
  const [row] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, t.lessonId));
  const pages = [
    { block: "rewrite", question: { block: "rewrite", ...base } },
    { block: "speakPrompt", question: { block: "speakPrompt", ...base } },
  ];
  const at = row!.material!.length;
  await testDb
    .update(schema.lesson)
    .set({
      material: [...row!.material!, ...pages.map((p) => ({ title: "P", body: "B", example: null, ...p }))] as any,
      pageStatus: [...row!.pageStatus!, ...pages.map(() => ({ page: "ready" as const, question: "ready" as const }))],
    })
    .where(eq(schema.lesson.id, t.lessonId));
  const feedback = (verdict: string | null) =>
    verdict ? ({ verdict, corrected: "", explanation: "ok" } as any) : null;
  await testDb.insert(schema.step).values(
    [rewrite, speaking].map((v, i) => ({
      userId: t.id,
      lessonId: t.lessonId,
      position: at + i,
      type: pages[i]!.block as any,
      input: {},
      feedback: feedback(v),
      answeredAt: new Date(),
    })),
  );
}

test("a Rewrite answer counts as grammar evidence: correct beats almost beats incorrect", async () => {
  // Scores are blended with the Learner's earlier level, so compare the three outcomes with each other.
  const grammar = async (verdict: "correct" | "almost" | "incorrect") => {
    const t = await ready();
    await withRewriteAndSpeaking(t, verdict, null);
    await finish(t);
    return (await lessonScores(t.id)).find((s) => s.skill === "grammar")!.score;
  };
  const [right, almost, wrong] = [await grammar("correct"), await grammar("almost"), await grammar("incorrect")];
  expect(right).toBeGreaterThan(almost);
  expect(almost).toBeGreaterThan(wrong);
});

test("an analysed spoken answer moves fluency; an unanalysed one leaves it alone", async () => {
  const done = await ready();
  await withRewriteAndSpeaking(done, "correct", "correct");
  await finish(done);
  expect((await lessonScores(done.id)).map((s) => s.skill)).toContain("fluency");

  const pending = await ready();
  await withRewriteAndSpeaking(pending, "correct", null);
  await finish(pending);
  expect((await lessonScores(pending.id)).map((s) => s.skill)).not.toContain("fluency");
});

test("finishing twice with Rewrite and Speaking answers records scores once", async () => {
  const t = await ready();
  await withRewriteAndSpeaking(t, "correct", "incorrect");
  await finish(t);
  const before = await lessonScores(t.id);
  await finish(t);
  expect(await lessonScores(t.id)).toEqual(before);
});
