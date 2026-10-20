import { expect, test } from "bun:test";
import { schema } from "@impromptu/db";
import { eq } from "drizzle-orm";
import { learnerWithRoadmap } from "./fixtures";
import { get, json, makeApp } from "./helpers";
import { testDb } from "./setup";

const explanation = "Because of the rule.";
const questions = [
  null, // reading
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
  { block: "rewrite", prompt: "Rewrite: I goes.", expectedAnswer: "SECRET-REWRITE", rubric: "SECRET-RUBRIC" },
  { block: "speakPrompt", prompt: "Say it.", expectedAnswer: "SECRET-SPEAK", rubric: "SECRET-RUBRIC" },
];

// A paged Lesson whose Pages and questions are already written, so these tests need no model.
async function ready() {
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
  return { ...l, lessonId: created!.id, app: makeApp() };
}
const answer = (t: Awaited<ReturnType<typeof ready>>, page: number, body: unknown) =>
  t.app.request(`/api/lessons/${t.lessonId}/pages/${page}/answer`, json({ answer: body }, t.cookie));

test("each graded Block returns the verdict, correct answer and explanation at once", async () => {
  const t = await ready();
  const cases: [number, unknown, string, unknown][] = [
    [1, "seen", "correct", "daily trip to work"],
    [2, " Goes. ", "correct", "goes"],
    [3, 0, "incorrect", 1],
    [
      4,
      [
        { left: "I", right: "goes" },
        { left: "she", right: "go" },
      ],
      "incorrect",
      questions[4]!.pairs,
    ],
    [5, ["She", "goes", "home"], "correct", ["She", "goes", "home"]],
  ];
  for (const [page, given, verdict, correctAnswer] of cases) {
    const res = await answer(t, page, given);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      verdict,
      correctAnswer,
      explanation,
      answer: typeof given === "string" ? given.trim() : given,
    });
  }
  // Every other right answer is correct too.
  const t2 = await ready();
  expect(((await (await answer(t2, 3, 1)).json()) as any).verdict).toBe("correct");
  expect(((await (await answer(t2, 4, questions[4]!.pairs)).json()) as any).verdict).toBe("correct");
  expect(((await (await answer(t2, 5, ["goes", "She", "home"])).json()) as any).verdict).toBe("incorrect");
});

test("rewrite and speakPrompt are saved with no verdict and never reveal their keys", async () => {
  const t = await ready();
  for (const page of [6, 7]) {
    const res = await answer(t, page, "My own words.");
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body).toMatchObject({ verdict: null, correctAnswer: null, explanation: null, answer: "My own words." });
    expect(JSON.stringify(body)).not.toContain("SECRET");
  }
  const rows = await testDb.select().from(schema.step).where(eq(schema.step.lessonId, t.lessonId));
  expect(rows.map((r) => [r.position, r.type, r.feedback])).toEqual([
    [6, "rewrite", null],
    [7, "speakPrompt", null],
  ]);
});

test("the Lesson never shows the key before submit, and shows the result after", async () => {
  const t = await ready();
  const read = async () =>
    (await (await t.app.request(`/api/lessons/${t.lessonId}/pages`, get(t.cookie))).json()) as any;
  const before = await read();
  expect(JSON.stringify(before)).not.toMatch(/Because of the rule|SECRET|daily trip|answerIndex/);
  expect(before.pages[2].result).toBeUndefined();
  await answer(t, 2, "wrong");
  const after = await read();
  expect(after.pages[2].result).toMatchObject({ verdict: "incorrect", correctAnswer: "goes", explanation });
  expect(after.pages[3].result).toBeUndefined();
  // The whole-Lesson view carries the same saved result, so a refresh restores it.
  const whole = (await (await t.app.request(`/api/lessons/${t.lessonId}`, get(t.cookie))).json()) as any;
  expect(whole.material[2].result).toMatchObject({ verdict: "incorrect", answer: "wrong" });
});

test("submitting again returns the first result and does not change it", async () => {
  const t = await ready();
  const first = await answer(t, 2, "goes");
  expect(first.status).toBe(201);
  const second = await answer(t, 2, "wrong");
  expect(second.status).toBe(200);
  expect(await second.json()).toEqual(await first.json());
  const rows = await testDb.select().from(schema.step).where(eq(schema.step.lessonId, t.lessonId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ position: 2, type: "fillGap", output: { answer: "goes" } });
  expect(rows[0]!.feedback?.verdict).toBe("correct");
});

test("bad answers, reading Pages, other Learners and Pages without a question are refused", async () => {
  const t = await ready();
  expect((await answer(t, 3, "not a number")).status).toBe(400);
  expect((await answer(t, 2, "")).status).toBe(400);
  expect((await answer(t, 0, "x")).status).toBe(409);
  expect((await answer(t, 99, "x")).status).toBe(409);
  const other = await learnerWithRoadmap();
  const res = await t.app.request(`/api/lessons/${t.lessonId}/pages/2/answer`, json({ answer: "goes" }, other.cookie));
  expect(res.status).toBe(404);
  await testDb
    .update(schema.lesson)
    .set({ pageStatus: questions.map(() => ({ page: "ready" as const, question: "pending" as const })) })
    .where(eq(schema.lesson.id, t.lessonId));
  expect((await answer(t, 2, "goes")).status).toBe(409);
});

test("the current Page is saved so the Learner resumes on it", async () => {
  const t = await ready();
  const patch = (page: number, cookie = t.cookie) =>
    t.app.request(`/api/lessons/${t.lessonId}/page`, json({ page }, cookie, "PATCH"));
  const read = async () =>
    (await (await t.app.request(`/api/lessons/${t.lessonId}/pages`, get(t.cookie))).json()) as any;
  expect((await read()).currentPage).toBe(0);
  expect((await patch(3)).status).toBe(200);
  expect((await read()).currentPage).toBe(3);
  expect(((await (await t.app.request(`/api/lessons/${t.lessonId}`, get(t.cookie))).json()) as any).currentPage).toBe(
    3,
  );
  // The recap is one past the last Page; nothing further exists.
  expect((await patch(questions.length)).status).toBe(200);
  expect((await patch(questions.length + 1)).status).toBe(404);
  expect((await patch(1, (await learnerWithRoadmap()).cookie)).status).toBe(404);
});
