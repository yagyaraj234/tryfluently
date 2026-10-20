import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { reportReply, takeWrittenAssessment } from "./fixtures";
import { get, json, makeApp, makeClock, mockChat, mockModel, signUp, userMessage } from "./helpers";
import { testDb } from "./setup";

const appWith = (reports: unknown[], clock = makeClock()) => ({
  clock,
  app: makeApp({
    now: clock,
    models: { step: mockChat(...reports.map(() => "Hello! Tell me about yourself.")), report: mockModel(...reports) },
  }),
});

describe("written assessment", () => {
  test("a Learner chats through a Written Assessment, ends it and reads the Report", async () => {
    const clock = makeClock();
    const step = mockChat("Hello! What do you do for work?");
    const report = mockModel(reportReply());
    const app = makeApp({ now: clock, models: { step, report } });
    const { cookie } = await signUp(app);

    const start = await app.request("/api/assessments", json({ mode: "written" }, cookie));
    expect(start.status).toBe(201);
    const { id, status } = (await start.json()) as any;
    expect(status).toBe("in_progress");

    const chat = await app.request(
      `/api/assessments/${id}/chat`,
      json({ message: userMessage("Hi, I'm ready.") }, cookie),
    );
    expect(chat.status).toBe(200);
    expect(await chat.text()).toContain("What do you do for work?");

    clock.advance({ minutes: 9 });
    const end = await app.request(`/api/assessments/${id}/end`, json({}, cookie));
    expect(end.status).toBe(200);

    const read = (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;
    expect(read.status).toBe("completed");
    expect(read.transcript.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect(read.report).toMatchObject({
      overallLevel: "B1",
      skills: { fluency: null, grammar: { score: 42, level: "B1" }, vocabulary: { score: 55, level: "B2" } },
      strengths: reportReply().strengths,
      weaknesses: reportReply().weaknesses,
      firstUnit: reportReply().firstUnit,
    });
    // The Report is written from the transcript.
    expect(JSON.stringify(report.doGenerateCalls[0]!.prompt)).toContain("What do you do for work?");
  });

  test("the chat works from the Learner Brief when they have a confirmed Goal", async () => {
    const step = mockChat("Tell me about your fintech work.");
    const app = makeApp({ models: { step, brief: mockModel("Asha is a backend engineer at a Pune fintech.") } });
    const { cookie } = await signUp(app);
    const goal = (await (
      await app.request("/api/goals", json({ kind: "job_interview", context: "CV..." }, cookie))
    ).json()) as any;
    await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));

    const { id } = (await (await app.request("/api/assessments", json({ mode: "written" }, cookie))).json()) as any;
    await (await app.request(`/api/assessments/${id}/chat`, json({ message: userMessage("Hi") }, cookie))).text();

    expect(JSON.stringify(step.doStreamCalls[0]!.prompt)).toContain("Asha is a backend engineer at a Pune fintech.");
  });

  test("model output that doesn't match the Report schema fails cleanly and stores nothing", async () => {
    const { app, clock } = appWith([{ overallLevel: "Z9", strengths: [] }]);
    const { cookie } = await signUp(app);

    const { id, end } = await takeWrittenAssessment(app, cookie, clock);
    expect(end.status).toBe(502);
    const read = (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;
    expect(read.report).toBeNull();
    expect(await (await app.request("/api/skill-profile", get(cookie))).json()).toMatchObject({ grammar: null });
  });

  test("a malformed chat message is rejected", async () => {
    const app = makeApp();
    const { cookie } = await signUp(app);
    const { id } = (await (await app.request("/api/assessments", json({ mode: "written" }, cookie))).json()) as any;

    const res = await app.request(
      `/api/assessments/${id}/chat`,
      json({ message: { role: "user", parts: "hi" } }, cookie),
    );
    expect(res.status).toBe(400);
  });

  test("a Learner can't read or chat in someone else's Assessment", async () => {
    const app = makeApp();
    const asha = await signUp(app);
    const ravi = await signUp(app);
    const { id } = (await (
      await app.request("/api/assessments", json({ mode: "written" }, asha.cookie))
    ).json()) as any;

    expect((await app.request(`/api/assessments/${id}`, get(ravi.cookie))).status).toBe(404);
    expect(
      (await app.request(`/api/assessments/${id}/chat`, json({ message: userMessage("hi") }, ravi.cookie))).status,
    ).toBe(404);
  });
});

describe("skill profile", () => {
  test("a Written Assessment sets grammar and vocabulary with CEFR Levels and leaves fluency unmeasured", async () => {
    const { app, clock } = appWith([reportReply()]);
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock);

    const profile = await app.request("/api/skill-profile", get(cookie));
    expect(await profile.json()).toEqual({
      fluency: null,
      grammar: { score: 42, level: "B1" },
      vocabulary: { score: 55, level: "B2" },
    });
  });

  test("a Written Assessment ignores any fluency score the model returns", async () => {
    const reply = reportReply();
    const { app, clock } = appWith([{ ...reply, skills: { ...reply.skills, fluency: { score: 90, evidence: [] } } }]);
    const { cookie } = await signUp(app);
    const { id } = await takeWrittenAssessment(app, cookie, clock);

    expect(await (await app.request("/api/skill-profile", get(cookie))).json()).toMatchObject({ fluency: null });
    const read = (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;
    expect(read.report.skills.fluency).toBeNull();
  });

  test.each([
    [0, 16, "A1", "A1"],
    [17, 33, "A2", "A2"],
    [34, 50, "B1", "B1"],
    [51, 67, "B2", "B2"],
    [68, 84, "C1", "C1"],
    [85, 100, "C2", "C2"],
  ])("scores %i and %i are labelled %s and %s", async (low, high, lowLevel, highLevel) => {
    const reply = reportReply();
    const skills = { fluency: null, grammar: { score: low, evidence: [] }, vocabulary: { score: high, evidence: [] } };
    const { app, clock } = appWith([{ ...reply, skills }]);
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock);

    expect(await (await app.request("/api/skill-profile", get(cookie))).json()).toMatchObject({
      grammar: { score: low, level: lowLevel },
      vocabulary: { score: high, level: highLevel },
    });
  });

  test("a later Assessment moves each score halfway toward the new result, and history keeps both", async () => {
    const first = reportReply();
    const second = {
      ...first,
      skills: { fluency: null, grammar: { score: 60, evidence: [] }, vocabulary: { score: 55, evidence: [] } },
    };
    const { app, clock } = appWith([first, second]);
    const { cookie } = await signUp(app);

    await takeWrittenAssessment(app, cookie, clock);
    clock.advance({ days: 8 });
    await takeWrittenAssessment(app, cookie, clock);

    // 42 + 0.5 × (60 − 42) = 51
    expect(await (await app.request("/api/skill-profile", get(cookie))).json()).toMatchObject({
      grammar: { score: 51, level: "B2" },
      vocabulary: { score: 55, level: "B2" },
    });

    const history = (await (await app.request("/api/skill-profile/history", get(cookie))).json()) as any[];
    expect(history.filter((h) => h.skill === "grammar").map((h) => [h.score, h.level])).toEqual([
      [42, "B1"],
      [51, "B2"],
    ]);
    expect(history.map((h) => h.source)).toEqual(["assessment", "assessment", "assessment", "assessment"]);
  });
});

describe("assessment report side effects", () => {
  test("each Report weakness becomes an open Focus Item sourced from the Assessment", async () => {
    const { app, clock } = appWith([reportReply()]);
    const { cookie, id: learnerId } = await signUp(app);
    const { id } = await takeWrittenAssessment(app, cookie, clock);

    const items = await testDb.select().from(schema.focusItem).where(eq(schema.focusItem.userId, learnerId));
    expect(items.map((i) => i.label).sort()).toEqual(
      reportReply()
        .weaknesses.map((w) => w.label)
        .sort(),
    );
    for (const item of items)
      expect(item).toMatchObject({ source: "assessment", sourceId: id, status: "open", hits: 0 });
  });

  test("with no Goals set, the Report's proposed Goals are stored as proposed Goals", async () => {
    const { app, clock } = appWith([reportReply()]);
    const { cookie } = await signUp(app);
    await takeWrittenAssessment(app, cookie, clock);

    expect(await (await app.request("/api/goals", get(cookie))).json()).toMatchObject([
      {
        kind: "general_fluency",
        statement: "Get ready for a senior backend role.",
        status: "proposed",
        targetLevels: { fluency: "B2", grammar: "B2", vocabulary: "C1" },
      },
    ]);
  });

  test("a Learner who already has Goals doesn't get extra proposed ones", async () => {
    const { app, clock } = appWith([reportReply()]);
    const { cookie } = await signUp(app);
    await app.request("/api/goals", json({ kind: "client_communication" }, cookie));
    await takeWrittenAssessment(app, cookie, clock);

    expect(await (await app.request("/api/goals", get(cookie))).json()).toMatchObject([
      { kind: "client_communication" },
    ]);
  });
});
