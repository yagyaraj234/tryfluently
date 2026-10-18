import { describe, expect, test } from "bun:test";
import { answerStep, feedback, fillGap, learnerWithRoadmap, lessonPlan, reportReply, takeWrittenAssessment, unitsReply } from "./fixtures";
import { get, json, makeApp, makeClock, mockChat, mockModel, mockTurns, userMessage, type TestApp, type Turn } from "./helpers";

const roadmapOf = async (app: TestApp, cookie: string) => (await (await app.request("/api/roadmap", get(cookie))).json()) as any[];
const skip = (app: TestApp, cookie: string, unitId: string) => app.request(`/api/roadmap/units/${unitId}/skip`, json({}, cookie));
const view = (units: any[]) => units.map((u) => `${u.position} ${u.title} ${u.status}`);

describe("roadmap revision", () => {
  test("finishing the active Unit rewrites only the planned Units", async () => {
    const roadmap = mockModel(unitsReply(3, "Revised"));
    const app = makeApp({ models: { roadmap } });
    const { cookie, units } = await learnerWithRoadmap();

    expect((await skip(app, cookie, units[0].id)).status).toBe(200);

    expect(view(await roadmapOf(app, cookie))).toEqual([
      "0 Unit 1 skipped",
      "1 Unit 2 active",
      "2 Revised 1 planned",
      "3 Revised 2 planned",
      "4 Revised 3 planned",
    ]);
    // The revision sees the Roadmap so far and the Learner's situation.
    const prompt = JSON.stringify(roadmap.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain("Unit 2");
    expect(prompt).toContain("Past simple vs present perfect");
  });

  test("an Assessment retake rewrites the planned Units", async () => {
    const clock = makeClock();
    const { cookie } = await learnerWithRoadmap(clock);
    const app = makeApp({
      now: clock,
      models: { step: mockChat("Hello again!"), report: mockModel(reportReply()), roadmap: mockModel(unitsReply(2, "After retake")) },
    });

    clock.advance({ days: 7 });
    const { end } = await takeWrittenAssessment(app, cookie, clock);
    expect(end.status).toBe(200);

    expect(view(await roadmapOf(app, cookie))).toEqual(["0 Unit 1 active", "1 After retake 1 planned", "2 After retake 2 planned"]);
  });

  test("mastered and skipped Units are never rewritten", async () => {
    const clock = makeClock();
    const { cookie, units } = await learnerWithRoadmap(clock);
    // Two 80+ Lessons master Unit 1; then skipping Unit 2 triggers a second revision.
    const turns: Turn[] = [[fillGap()], [feedback(), fillGap()], [feedback(), fillGap()], [feedback(), { tool: "endLesson", input: {} }]];
    const step = mockTurns(...turns, ...turns);
    step.doGenerate = mockModel(lessonPlan(), lessonPlan()).doGenerate;
    const judged = { skills: { fluency: null, grammar: null, vocabulary: null }, objectiveProgress: 90, summary: "Done.", focusItems: null };
    const app = makeApp({
      now: clock,
      models: {
        step,
        judge: mockModel(judged, judged),
        roadmap: mockModel(unitsReply(4, "First revision"), unitsReply(2, "Second revision")),
      },
    });
    for (let n = 0; n < 2; n++) {
      clock.advance({ minutes: 5 });
      const lesson = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
      await (await app.request(`/api/lessons/${lesson.id}/chat`, json({ message: userMessage("Let's start") }, cookie))).text();
      for (let i = 0; i < 3; i++) await answerStep(app, cookie, lesson.id, { answer: "goes" });
    }
    expect(view(await roadmapOf(app, cookie)).slice(0, 3)).toEqual(["0 Unit 1 mastered", "1 Unit 2 active", "2 First revision 1 planned"]);

    await skip(app, cookie, units[1].id);
    expect(view(await roadmapOf(app, cookie))).toEqual([
      "0 Unit 1 mastered",
      "1 Unit 2 skipped",
      "2 First revision 1 active",
      "3 Second revision 1 planned",
      "4 Second revision 2 planned",
    ]);
  });

  test("with every Unit done and a skill below its Target Level, new Units are added and the first becomes active", async () => {
    const roadmap = mockModel(unitsReply(3, "More"));
    const app = makeApp({ models: { roadmap } });
    const { cookie, units } = await learnerWithRoadmap(); // grammar B1 against a B2 target
    for (const u of units.slice(1)) await skip(app, cookie, u.id); // planned Units: no revision
    expect(roadmap.doGenerateCalls).toHaveLength(0);

    await skip(app, cookie, units[0].id);

    expect(view((await roadmapOf(app, cookie)).slice(8))).toEqual(["8 More 1 active", "9 More 2 planned", "10 More 3 planned"]);
  });

  test("with every Unit done and every skill at its Target Level, nothing is added", async () => {
    const roadmap = mockModel();
    const app = makeApp({ models: { roadmap } });
    // grammar 42 (B1) and vocabulary 55 (B2) already meet these targets.
    const { cookie, units } = await learnerWithRoadmap(makeClock(), {}, { targetLevels: { grammar: "B1", vocabulary: "B2" } });
    for (const u of [...units.slice(1), units[0]]) await skip(app, cookie, u.id);

    expect(await roadmapOf(app, cookie)).toHaveLength(8);
    expect(roadmap.doGenerateCalls).toHaveLength(0);
  });

  test("invalid revision output keeps the old planned Units, and the Unit still finishes", async () => {
    const app = makeApp({ models: { roadmap: mockModel({ units: [] }) } });
    const { cookie, units } = await learnerWithRoadmap();

    expect((await skip(app, cookie, units[0].id)).status).toBe(200);
    expect(view(await roadmapOf(app, cookie)).slice(0, 3)).toEqual(["0 Unit 1 skipped", "1 Unit 2 active", "2 Unit 3 planned"]);
    expect(await roadmapOf(app, cookie)).toHaveLength(8);
  });
});
