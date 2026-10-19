import { describe, expect, test } from "bun:test";
import {
  answerStep,
  feedback,
  fillGap,
  learnerWithLegacyRoadmap as learnerWithRoadmap,
  lessonPlan,
  unitsReply,
} from "./fixtures";
import { get, json, makeApp, makeClock, mockModel, mockTurns, userMessage, type TestApp, type Turn } from "./helpers";

const judgeReply = (
  objectiveProgress: number,
  skills: object = { grammar: { score: 62, evidence: ["She goes to work."] } },
) => ({
  skills: { fluency: null, grammar: null, vocabulary: null, ...skills },
  objectiveProgress,
  summary: `Practised present simple; progress ${objectiveProgress}.`,
  focusItems: null,
});

// The four chat turns of a 3-Step Lesson that the model then ends.
const lessonTurns: Turn[] = [
  [fillGap()],
  [feedback(), fillGap()],
  [feedback(), fillGap()],
  [feedback(), { tool: "endLesson", input: {} }],
];

// An app scripted to plan and run one 3-Step Lesson per judge reply.
function judgedApp(judgeReplies: unknown[]) {
  const n = judgeReplies.length;
  const step = mockTurns(...Array.from({ length: n }, () => lessonTurns).flat());
  // Lesson plans come from the same step model, through generate rather than stream.
  const plan = mockModel(...Array.from({ length: n }, (_, i) => lessonPlan({ title: `Lesson ${i + 1}` })));
  step.doGenerate = plan.doGenerate;
  const judge = mockModel(...judgeReplies);
  // Shared with the setup, so Lesson scores land after the Assessment's.
  const clock = makeClock();
  // Finishing a Unit revises the Roadmap.
  const roadmap = mockModel(unitsReply(3, "Revised"));
  return { app: makeApp({ now: clock, models: { step, judge, roadmap } }), plan, judge, clock };
}

async function doLesson(app: TestApp, cookie: string, clock: ReturnType<typeof makeClock>) {
  clock.advance({ minutes: 5 });
  const lesson = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
  await (
    await app.request(`/api/lessons/${lesson.id}/chat`, json({ message: userMessage("Let's start") }, cookie))
  ).text();
  for (let i = 0; i < 3; i++) await answerStep(app, cookie, lesson.id, { answer: "goes" });
  return (await (await app.request(`/api/lessons/${lesson.id}`, get(cookie))).json()) as any;
}

const roadmapOf = async (app: TestApp, cookie: string) =>
  (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
const profileOf = async (app: TestApp, cookie: string) =>
  (await (await app.request("/api/skill-profile", get(cookie))).json()) as any;

describe("lesson judge", () => {
  test("completing a Lesson stores objective progress and a summary, and moves only the skills it practised", async () => {
    const { app, judge, clock } = judgedApp([judgeReply(65)]);
    const { cookie } = await learnerWithRoadmap(clock); // grammar 42, vocabulary 55

    const lesson = await doLesson(app, cookie, clock);
    expect(lesson).toMatchObject({
      status: "completed",
      objectiveProgress: 65,
      summary: "Practised present simple; progress 65.",
    });

    // 42 + 0.15 × (62 − 42) = 45; vocabulary wasn't practised, so it stays.
    expect(await profileOf(app, cookie)).toMatchObject({
      grammar: { score: 45 },
      vocabulary: { score: 55 },
      fluency: null,
    });
    const history = (await (await app.request("/api/skill-profile/history", get(cookie))).json()) as any[];
    expect(history.filter((h) => h.source === "lesson")).toEqual([
      expect.objectContaining({ skill: "grammar", sourceId: lesson.id }),
    ]);
    // The judge saw what the Learner answered.
    expect(JSON.stringify(judge.doGenerateCalls[0]!.prompt)).toContain("She ___ to work every day.");
  });

  test("one bad Lesson moves a score by at most α × the difference", async () => {
    const { app, clock } = judgedApp([judgeReply(10, { grammar: { score: 0, evidence: [] } })]);
    const { cookie } = await learnerWithRoadmap(clock);
    await doLesson(app, cookie, clock);

    // 42 − 0.15 × 42 = 35.7
    expect(await profileOf(app, cookie)).toMatchObject({ grammar: { score: 36, level: "B1" } });
  });

  test("the next Lesson is planned from the earlier Lessons' summaries", async () => {
    const { app, plan, clock } = judgedApp([judgeReply(50), judgeReply(50)]);
    const { cookie } = await learnerWithRoadmap(clock);
    await doLesson(app, cookie, clock);
    await doLesson(app, cookie, clock);

    expect(JSON.stringify(plan.doGenerateCalls[1]!.prompt)).toContain("Practised present simple; progress 50.");
  });
});

describe("roadmap lessons", () => {
  test("each Unit on the Roadmap lists its Lessons in order, with their status and objective progress", async () => {
    const { app, clock } = judgedApp([judgeReply(65), judgeReply(50)]);
    const { cookie } = await learnerWithRoadmap(clock);
    const done = await doLesson(app, cookie, clock);
    const open = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;

    const [first, second] = await roadmapOf(app, cookie);
    expect(first.lessons).toMatchObject([
      { id: done.id, position: 0, kind: "practice", title: done.title, status: "completed", objectiveProgress: 65 },
      { id: open.id, position: 1, kind: "practice", title: open.title, status: "in_progress", objectiveProgress: null },
    ]);
    expect(second.lessons).toEqual([]);
  });
});

describe("unit progression", () => {
  test("skipping the active Unit marks it skipped, not mastered, and activates the next one", async () => {
    const app = makeApp({ models: { step: mockModel(lessonPlan()), roadmap: mockModel(unitsReply(3, "Revised")) } });
    const { cookie, units } = await learnerWithRoadmap();
    const inProgress = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;

    const res = await app.request(`/api/roadmap/units/${units[0].id}/skip`, json({}, cookie));
    expect(res.status).toBe(200);
    expect((await roadmapOf(app, cookie)).slice(0, 2).map((u) => u.status)).toEqual(["skipped", "active"]);
    // The Lesson left in the skipped Unit is abandoned.
    expect(await (await app.request(`/api/lessons/${inProgress.id}`, get(cookie))).json()).toMatchObject({
      status: "abandoned",
    });
  });

  test("skipping a planned Unit leaves the active one alone; finished Units can't be skipped", async () => {
    const app = makeApp();
    const { cookie, units } = await learnerWithRoadmap();

    await app.request(`/api/roadmap/units/${units[2].id}/skip`, json({}, cookie));
    expect((await roadmapOf(app, cookie)).slice(0, 3).map((u) => u.status)).toEqual(["active", "planned", "skipped"]);
    expect((await app.request(`/api/roadmap/units/${units[2].id}/skip`, json({}, cookie))).status).toBe(409);
  });

  test("a Learner can't skip someone else's Unit", async () => {
    const app = makeApp();
    const asha = await learnerWithRoadmap();
    const ravi = await learnerWithRoadmap();
    expect((await app.request(`/api/roadmap/units/${asha.units[0].id}/skip`, json({}, ravi.cookie))).status).toBe(404);
  });
});
