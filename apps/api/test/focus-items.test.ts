import { describe, expect, test } from "bun:test";
import { answerStep, fillGap, learnerWithRoadmap, lessonPlan } from "./fixtures";
import { get, json, makeApp, makeClock, mockModel, mockTurns, userMessage, type TestApp, type Turn } from "./helpers";

const focusOf = async (app: TestApp, cookie: string) => (await (await app.request("/api/focus-items", get(cookie))).json()) as any[];

const usedCorrectly = (focusItemIds: string[]) => ({
  tool: "giveFeedback",
  input: { verdict: "correct", corrected: "She goes to work every day.", explanation: "Well done.", focusItemIds },
});

const judgeReply = (focusItems: object[] = []) => ({
  skills: { fluency: null, grammar: null, vocabulary: null }, objectiveProgress: 50, summary: "Practised routines.", focusItems,
});

function appWith(turns: Turn[], judgeReplies: unknown[] = [judgeReply()]) {
  const clock = makeClock();
  const step = mockTurns(...turns);
  step.doGenerate = mockModel(lessonPlan()).doGenerate;
  return { app: makeApp({ now: clock, models: { step, judge: mockModel(...judgeReplies) } }), step, clock };
}

async function startLesson(app: TestApp, cookie: string) {
  const lesson = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
  await (await app.request(`/api/lessons/${lesson.id}/chat`, json({ message: userMessage("Let's start") }, cookie))).text();
  return lesson;
}

describe("focus items in lessons", () => {
  test("the Focus Items list shows the Learner's items from their Assessment", async () => {
    const { app } = appWith([]);
    const { cookie } = await learnerWithRoadmap();

    const items = await focusOf(app, cookie);
    expect(items.map((i) => i.label).sort()).toEqual(["Articles before job titles", "Overused 'very'", "Past simple vs present perfect"]);
    expect(items[0]).toMatchObject({ source: "assessment", status: "open", hits: 0 });
  });

  test("the end-of-Lesson judge creates Focus Items for recurring mistakes, sourced from the Lesson", async () => {
    const turns: Turn[] = [
      [fillGap()],
      [usedCorrectly([]), fillGap()],
      [usedCorrectly([]), fillGap()],
      [usedCorrectly([]), { tool: "endLesson", input: {} }],
    ];
    const { app, clock } = appWith(turns, [judgeReply([{ label: "Third person -s", kind: "grammar" }])]);
    const { cookie } = await learnerWithRoadmap(clock);
    const lesson = await startLesson(app, cookie);
    for (let i = 0; i < 3; i++) await answerStep(app, cookie, lesson.id, { answer: "goes" });

    expect((await focusOf(app, cookie)).find((i) => i.label === "Third person -s")).toMatchObject({
      kind: "grammar",
      source: "lesson",
      sourceId: lesson.id,
      status: "open",
      hits: 0,
    });
  });

  test("giveFeedback counts a hit for each open Focus Item used correctly, and the 3rd hit closes it", async () => {
    const { app: setup } = appWith([]);
    const { cookie } = await learnerWithRoadmap();
    const target = (await focusOf(setup, cookie)).find((i) => i.label === "Past simple vs present perfect");

    const hit = usedCorrectly([target.id]);
    const { app } = appWith([[fillGap()], [hit, fillGap()], [hit, fillGap()], [hit, fillGap()]]);
    const lesson = await startLesson(app, cookie);

    await answerStep(app, cookie, lesson.id, { answer: "goes" });
    await answerStep(app, cookie, lesson.id, { answer: "goes" });
    expect((await focusOf(app, cookie)).find((i) => i.id === target.id)).toMatchObject({ hits: 2, status: "open", closedAt: null });

    await answerStep(app, cookie, lesson.id, { answer: "goes" });
    expect((await focusOf(app, cookie)).find((i) => i.id === target.id)).toMatchObject({
      hits: 3,
      status: "closed",
      closedAt: expect.any(String),
    });
  });

  test("ids that aren't the Learner's open Focus Items are ignored", async () => {
    const { app: setup } = appWith([]);
    const asha = await learnerWithRoadmap();
    const ravi = await learnerWithRoadmap();
    const ravisItem = (await focusOf(setup, ravi.cookie))[0];

    const { app } = appWith([[fillGap()], [usedCorrectly([ravisItem.id, "not-an-id"]), fillGap()]]);
    const lesson = await startLesson(app, asha.cookie);
    expect((await answerStep(app, asha.cookie, lesson.id, { answer: "goes" })).status).toBe(200);

    expect((await focusOf(app, ravi.cookie)).find((i) => i.id === ravisItem.id)).toMatchObject({ hits: 0 });
    expect((await focusOf(app, asha.cookie)).every((i) => i.hits === 0)).toBe(true);
  });

  test("open Focus Items are in the Lesson instructions with their ids; closed ones drop out", async () => {
    const { app: setup } = appWith([]);
    const { cookie } = await learnerWithRoadmap();
    const items = await focusOf(setup, cookie);
    const target = items.find((i) => i.label === "Past simple vs present perfect");
    const other = items.find((i) => i.label === "Articles before job titles");

    const hit = usedCorrectly([target.id]);
    const { app, step } = appWith([[fillGap()], [hit, fillGap()], [hit, fillGap()], [hit, fillGap()], [usedCorrectly([]), fillGap()]]);
    const lesson = await startLesson(app, cookie);
    for (let i = 0; i < 4; i++) await answerStep(app, cookie, lesson.id, { answer: "goes" });

    const instructions = (n: number) => JSON.stringify(step.doStreamCalls[n]!.prompt);
    expect(instructions(0)).toContain(target.id);
    expect(instructions(0)).toContain("Past simple vs present perfect");
    // Call 4 is made after the 3rd hit closed it.
    expect(instructions(4)).not.toContain("Past simple vs present perfect");
    expect(instructions(4)).toContain(other.id);
  });
});
