import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq, sql } from "drizzle-orm";
import { completeLesson } from "../src/completion";
import { recordScores, skillProfile } from "../src/scoring";
import { makeApp, makeClock, mockModel, signUp, userMessage } from "./helpers";
import { testDb } from "./setup";

const judgement = {
  skills: { fluency: null, grammar: { score: 60, evidence: ["I have worked here for years."] }, vocabulary: null },
  objectiveProgress: 70,
  summary: "Practised present perfect.",
  focusItems: [{ label: "Present perfect", kind: "grammar" }],
  overallImpression: "Clear answers.",
  questions: [
    {
      question: "Tell me about yourself.",
      quote: "I work here since years.",
      strongerPhrasing: "I have worked here for years.",
      languageIssues: ["Present perfect"],
    },
  ],
  phrasesToLearn: ["I have worked here for years.", "One challenge was ...", "For example ..."],
};

async function setup(kind: "practice" | "roleplay", replies: unknown[] = [judgement, judgement]) {
  const now = makeClock();
  const { id: userId } = await signUp(makeApp());
  const [row] = await testDb
    .insert(schema.lesson)
    .values({
      userId,
      kind,
      title: "Mock Interview",
      objective: "Use present perfect",
      position: 0,
      roleplayKind: kind === "roleplay" ? "mock_interview" : null,
      tone: kind === "roleplay" ? "standard" : null,
      textMode: true,
      messages: [userMessage("I work here since years.")],
      startedAt: now(),
    })
    .returning();
  await recordScores(
    testDb,
    userId,
    { grammar: 40 },
    {
      alpha: 0.5,
      source: "assessment",
      sourceId: "baseline",
      at: new Date(now().getTime() - 1000),
    },
  );
  const judge = mockModel(...replies);
  const ctx = {
    db: testDb,
    now,
    settings: { alphaLesson: 0.15 },
    models: { judge, step: judge, report: judge, brief: judge, roadmap: judge },
  };
  return { ctx, row: row!, judge };
}

async function results(id: string) {
  return {
    lesson: (await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, id)))[0],
    scores: await testDb.select().from(schema.skillScore).where(eq(schema.skillScore.sourceId, id)),
    focus: await testDb.select().from(schema.focusItem).where(eq(schema.focusItem.sourceId, id)),
    steps: await testDb.select().from(schema.step).where(eq(schema.step.lessonId, id)),
  };
}

describe("Lesson completion", () => {
  for (const kind of ["practice", "roleplay"] as const) {
    test(`${kind}: a failed completion rolls back every result and can be retried`, async () => {
      const { ctx, row } = await setup(kind);
      const constraint = `completion_failure_${crypto.randomUUID().replaceAll("-", "")}`;
      // Generated UUID and identifier only; the check fails the final write for this Lesson alone.
      await testDb.execute(
        sql.raw(`alter table lesson add constraint ${constraint} check (id <> '${row.id}' or status <> 'completed')`),
      );
      try {
        await expect(completeLesson(ctx, row.id, row.userId)).rejects.toThrow();
        expect(await results(row.id)).toMatchObject({
          lesson: { status: "in_progress", debrief: null, completedAt: null },
          scores: [],
          focus: [],
          steps: [],
        });
        expect((await skillProfile(testDb, row.userId)).grammar?.score).toBe(40);
      } finally {
        await testDb.execute(sql.raw(`alter table lesson drop constraint ${constraint}`));
      }
      expect(await completeLesson(ctx, row.id, row.userId)).toMatchObject({ status: "completed" });
      const saved = await results(row.id);
      expect(saved.scores).toHaveLength(1);
      expect(saved.focus).toHaveLength(kind === "roleplay" ? 3 : 1);
      expect(saved.steps).toHaveLength(kind === "roleplay" ? 1 : 0);
      expect((await skillProfile(testDb, row.userId)).grammar?.score).toBe(43);
    });

    test(`${kind}: concurrent completion applies results once and returns the saved result`, async () => {
      const { ctx, row, judge } = await setup(kind);
      const generate = judge.doGenerate.bind(judge);
      const gate = Promise.withResolvers<void>();
      let judging = 0;
      judge.doGenerate = async (options) => {
        const reply = await generate(options);
        if (++judging === 2) gate.resolve();
        await gate.promise;
        return reply;
      };
      const [first, second] = await Promise.all([
        completeLesson(ctx, row.id, row.userId),
        completeLesson(ctx, row.id, row.userId),
      ]);
      expect(first).toEqual(second);
      expect(first.status).toBe("completed");
      expect(judging).toBe(2);
      const saved = await results(row.id);
      expect(saved.scores).toHaveLength(1);
      expect(saved.focus).toHaveLength(kind === "roleplay" ? 3 : 1);
      expect(saved.steps).toHaveLength(kind === "roleplay" ? 1 : 0);
      expect((await skillProfile(testDb, row.userId)).grammar?.score).toBe(43);
      expect(await completeLesson(ctx, row.id, row.userId)).toMatchObject(first);
      expect(judging).toBe(2);
    });
  }

  test("malformed practice judgement still completes without changing skills", async () => {
    const { ctx, row } = await setup("practice", [{}]);
    expect(await completeLesson(ctx, row.id, row.userId)).toMatchObject({ status: "completed" });
    expect(await results(row.id)).toMatchObject({
      lesson: { objectiveProgress: null, summary: null },
      scores: [],
      focus: [],
    });
  });

  test("malformed Roleplay judgement stays open for retry", async () => {
    const { ctx, row } = await setup("roleplay", [{}, judgement]);
    expect(await completeLesson(ctx, row.id, row.userId)).toEqual({ status: "failed" });
    expect(await results(row.id)).toMatchObject({
      lesson: { status: "in_progress" },
      scores: [],
      focus: [],
      steps: [],
    });
    expect(await completeLesson(ctx, row.id, row.userId)).toMatchObject({ status: "completed" });
  });
});

describe("Score write order", () => {
  test("the last score written is the latest, even if its timestamp is older", async () => {
    const { id: userId } = await signUp(makeApp());
    const base = { alpha: 0.5, source: "lesson" as const, sourceId: "x" };
    await recordScores(testDb, userId, { grammar: 75 }, { ...base, at: new Date("2026-01-02") });
    await recordScores(testDb, userId, { grammar: 37.5 }, { ...base, at: new Date("2026-01-01") });
    expect((await skillProfile(testDb, userId)).grammar?.score).toBe(56);
  });
});
