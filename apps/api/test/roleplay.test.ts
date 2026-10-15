import { describe, expect, test } from "bun:test";
import { schema } from "@impromptu/db";
import { and, eq } from "drizzle-orm";
import { answerStep, feedback, fillGap, learnerWithRoadmap, lessonPlan } from "./fixtures";
import { fakeRealtime, get, json, makeApp, makeClock, mockModel, mockTurns, userMessage, WEB_ORIGIN, type TestApp } from "./helpers";
import { testDb } from "./setup";

const offer = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n";
const sdp = (cookie: string) => ({
  method: "POST",
  headers: { "content-type": "application/sdp", origin: WEB_ORIGIN, cookie },
  body: offer,
});

// Sideband events for one Learner answer: voice timing, then the transcript.
const learnerTurn = (itemId: string, startMs: number, endMs: number, transcript: string) => [
  { type: "input_audio_buffer.speech_started", item_id: itemId, audio_start_ms: startMs },
  { type: "input_audio_buffer.speech_stopped", item_id: itemId, audio_end_ms: endMs },
  { type: "conversation.item.input_audio_transcription.completed", item_id: itemId, transcript },
];
const coachTurn = (itemId: string, transcript: string) => [{ type: "response.output_audio_transcript.done", item_id: itemId, transcript }];

const debriefReply = (over: Record<string, unknown> = {}) => ({
  overallImpression: "Clear, confident answers with a few tense slips.",
  questions: [
    {
      question: "Tell me about yourself.",
      quote: "I am working in fintech since four years.",
      strongerPhrasing: "I've been working in fintech for four years.",
      languageIssues: ["Present perfect continuous with 'for'"],
    },
    {
      question: "Tell me about a time you disagreed with a teammate.",
      quote: "We had discuss and then we agreed.",
      strongerPhrasing: "We talked it through and agreed on a plan.",
      languageIssues: ["Past simple after 'had'"],
    },
  ],
  skills: {
    grammar: { score: 62, evidence: ["I am working in fintech since four years."] },
    vocabulary: { score: 55, evidence: [] },
    fluency: { score: 70, evidence: [] },
  },
  phrasesToLearn: ["I've been working in … for …", "One challenge I faced was …", "That's a great question."],
  objectiveProgress: 90,
  summary: "Mock Interview: strong structure, tense slips with for/since.",
  ...over,
});

const lessonOf = async (app: TestApp, cookie: string, id: string) =>
  (await (await app.request(`/api/lessons/${id}`, get(cookie))).json()) as any;

const confirmedGoal = async (app: TestApp, cookie: string) =>
  ((await (await app.request("/api/goals", get(cookie))).json()) as any[])[0];

const startRoleplay = async (app: TestApp, cookie: string, body: Record<string, unknown> = {}) => {
  const goal = await confirmedGoal(app, cookie);
  return (await (await app.request("/api/roleplays", json({ goalId: goal.id, ...body }, cookie))).json()) as any;
};

// A Roleplay started from the Learner's Goal, with its call live and two answered questions on the sideband.
async function liveRoleplay(app: TestApp, realtime: ReturnType<typeof fakeRealtime>, cookie: string) {
  const roleplay = await startRoleplay(app, cookie);
  await app.request(`/api/roleplays/${roleplay.id}/call`, sdp(cookie));
  const sb = realtime.sideband();
  const sixtyWords = Array(60).fill("word").join(" ");
  // 120 words in 60 s of speech (120 wpm), with one 1 s hesitation.
  for (const e of [
    ...coachTurn("c1", "Tell me about yourself."),
    ...learnerTurn("u1", 0, 30_000, sixtyWords),
    ...coachTurn("c2", "Tell me about a time you disagreed with a teammate."),
    ...learnerTurn("u2", 31_000, 61_000, sixtyWords),
  ])
    sb.emit(e);
  return { roleplay, sb };
}

describe("starting a Roleplay", () => {
  test("from a Job Interview Goal it's a Mock Interview with a Standard interviewer by default", async () => {
    const app = makeApp();
    const { cookie } = await learnerWithRoadmap();
    const goal = await confirmedGoal(app, cookie);

    const res = await app.request("/api/roleplays", json({ goalId: goal.id }, cookie));
    expect(res.status).toBe(201);
    const roleplay = (await res.json()) as any;
    expect(roleplay).toMatchObject({
      kind: "roleplay",
      roleplayKind: "mock_interview",
      tone: "standard",
      status: "in_progress",
      textMode: false,
      unitId: null,
      title: "Mock Interview",
    });
    // "Interview" only ever appears as "Mock Interview".
    expect(`${roleplay.title} ${roleplay.objective}`.replaceAll("Mock Interview", "")).not.toMatch(/interview/i);
  });

  test("the Learner can pick the kind and the tone", async () => {
    const app = makeApp();
    const { cookie } = await learnerWithRoadmap();
    expect(await startRoleplay(app, cookie, { kind: "client_call", tone: "tough" })).toMatchObject({
      roleplayKind: "client_call",
      tone: "tough",
      title: "Client Call",
    });
  });

  test("a General Fluency Goal needs the kind spelled out", async () => {
    const app = makeApp();
    const { cookie } = await learnerWithRoadmap();
    const general = (await (await app.request("/api/goals", json({ kind: "general_fluency" }, cookie))).json()) as any;

    expect((await app.request("/api/roleplays", json({ goalId: general.id }, cookie))).status).toBe(400);
    expect((await app.request("/api/roleplays", json({ goalId: general.id, kind: "client_call" }, cookie))).status).toBe(201);
  });

  test("a Learner can't start a Roleplay from someone else's Goal", async () => {
    const app = makeApp();
    const asha = await learnerWithRoadmap();
    const ravi = await learnerWithRoadmap();
    const goal = await confirmedGoal(app, asha.cookie);

    expect((await app.request("/api/roleplays", json({ goalId: goal.id }, ravi.cookie))).status).toBe(404);
  });
});

describe("Roleplay call", () => {
  test("the call goes through the shared broker with Roleplay instructions built from the Learner Brief", async () => {
    const realtime = fakeRealtime();
    const app = makeApp({ realtime, models: { brief: mockModel("Asha is a backend engineer at a Pune fintech.") } });
    const { cookie, id: learnerId } = await learnerWithRoadmap();
    const withCv = (await (await app.request("/api/goals", json({ kind: "job_interview", context: "CV: backend, fintech" }, cookie))).json()) as any;
    await app.request(`/api/goals/${withCv.id}/confirm`, json({}, cookie));
    const roleplay = (await (await app.request("/api/roleplays", json({ goalId: withCv.id, tone: "tough" }, cookie))).json()) as any;

    const res = await app.request(`/api/roleplays/${roleplay.id}/call`, sdp(cookie));
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("v=0 answer for rtc_1");

    const instructions = realtime.sideband().sent.find((e) => e.type === "session.update").session.instructions;
    expect(instructions).toContain("Asha is a backend engineer at a Pune fintech.");
    expect(instructions).toContain("Tough");

    await realtime.sideband().close();
    const [usage] = await testDb
      .select()
      .from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.userId, learnerId), eq(schema.aiUsage.kind, "realtime")));
    expect(usage!.usage).toMatchObject({ purpose: "roleplay" });
  });

  test("only one live voice call at a time, across Roleplays", async () => {
    const realtime = fakeRealtime();
    const app = makeApp({ realtime });
    const { cookie } = await learnerWithRoadmap();
    const first = await startRoleplay(app, cookie);
    const second = await startRoleplay(app, cookie);
    await app.request(`/api/roleplays/${first.id}/call`, sdp(cookie));

    expect((await app.request(`/api/roleplays/${second.id}/call`, sdp(cookie))).status).toBe(409);
  });

  test("a call can only be started on the Learner's own Roleplay", async () => {
    const app = makeApp({ models: { step: mockModel(lessonPlan()) } });
    const asha = await learnerWithRoadmap();
    const ravi = await learnerWithRoadmap();
    const roleplay = await startRoleplay(app, asha.cookie);
    const practice = (await (await app.request("/api/lessons/next", json({}, ravi.cookie))).json()) as any;

    expect((await app.request(`/api/roleplays/${roleplay.id}/call`, sdp(ravi.cookie))).status).toBe(404);
    expect((await app.request(`/api/roleplays/${practice.id}/call`, sdp(ravi.cookie))).status).toBe(404);
  });
});

describe("ending a Roleplay", () => {
  test("ending hangs up and stores a Debrief, one roleplayTurn Step per question, new scores and 3 Focus Items", async () => {
    const clock = makeClock();
    const realtime = fakeRealtime();
    const judge = mockModel(debriefReply());
    const app = makeApp({ now: clock, realtime, models: { judge } });
    const { cookie, id: learnerId } = await learnerWithRoadmap(clock); // grammar 42, vocabulary 55, no fluency yet
    const { roleplay, sb } = await liveRoleplay(app, realtime, cookie);
    clock.advance({ minutes: 10 });

    const res = await app.request(`/api/roleplays/${roleplay.id}/end`, json({}, cookie));
    expect(res.status).toBe(200);
    expect(sb.hungUp).toBe(true);

    const done = await lessonOf(app, cookie, roleplay.id);
    expect(done).toMatchObject({ status: "completed", objectiveProgress: 90, summary: debriefReply().summary });
    expect(done.debrief).toEqual({
      textMode: false,
      overallImpression: debriefReply().overallImpression,
      questions: debriefReply().questions,
      phrasesToLearn: debriefReply().phrasesToLearn,
      // grammar 42 + 0.15 × (62 − 42) = 45; fluency is first measured here: 0.4 × 60 + 0.2 × 98.4 + 0.4 × 70 ≈ 72
      skillChanges: { grammar: { from: 42, to: 45 }, vocabulary: { from: 55, to: 55 }, fluency: { from: null, to: 72 } },
    });
    expect(done.steps.map((s: any) => [s.type, s.mode, s.input.question])).toEqual([
      ["roleplayTurn", "voice", "Tell me about yourself."],
      ["roleplayTurn", "voice", "Tell me about a time you disagreed with a teammate."],
    ]);
    expect(done.steps[0]).toMatchObject({
      output: { answer: "I am working in fintech since four years." },
      feedback: { corrected: "I've been working in fintech for four years." },
    });
    // The judge read the conversation.
    expect(JSON.stringify(judge.doGenerateCalls[0]!.prompt)).toContain("Tell me about a time you disagreed");

    expect(await (await app.request("/api/skill-profile", get(cookie))).json()).toMatchObject({
      grammar: { score: 45 },
      vocabulary: { score: 55 },
      fluency: { score: 72 },
    });
    const phrases = await testDb
      .select()
      .from(schema.focusItem)
      .where(and(eq(schema.focusItem.userId, learnerId), eq(schema.focusItem.source, "debrief")));
    expect(phrases.map((f) => f.label).sort()).toEqual([...debriefReply().phrasesToLearn].sort());
    for (const f of phrases) expect(f).toMatchObject({ kind: "phrase", sourceId: roleplay.id, status: "open" });

    // It counts as a completed Lesson: 2 Steps × 10 + 1 Lesson × 20.
    expect(await (await app.request("/api/progress", get(cookie))).json()).toEqual({ xp: 40, streak: 1 });
  });

  test("a Debrief that doesn't match its schema fails cleanly and can be tried again", async () => {
    const realtime = fakeRealtime();
    const app = makeApp({ realtime, models: { judge: mockModel({ overallImpression: "ok" }, debriefReply()) } });
    const { cookie } = await learnerWithRoadmap();
    const { roleplay } = await liveRoleplay(app, realtime, cookie);

    expect((await app.request(`/api/roleplays/${roleplay.id}/end`, json({}, cookie))).status).toBe(502);
    expect(await lessonOf(app, cookie, roleplay.id)).toMatchObject({ status: "in_progress", debrief: null, steps: [] });

    expect((await app.request(`/api/roleplays/${roleplay.id}/end`, json({}, cookie))).status).toBe(200);
    expect(await lessonOf(app, cookie, roleplay.id)).toMatchObject({ status: "completed" });
  });

  test("a Roleplay ended before the Learner said anything is abandoned without a Debrief", async () => {
    const realtime = fakeRealtime();
    const app = makeApp({ realtime });
    const { cookie } = await learnerWithRoadmap();
    const roleplay = await startRoleplay(app, cookie);
    await app.request(`/api/roleplays/${roleplay.id}/call`, sdp(cookie));

    expect(await (await app.request(`/api/roleplays/${roleplay.id}/end`, json({}, cookie))).json()).toMatchObject({ status: "abandoned" });
    expect(await lessonOf(app, cookie, roleplay.id)).toMatchObject({ status: "abandoned", debrief: null });
  });
});

describe("Roleplay at the end of a Unit", () => {
  test("in a Unit that ends with a Roleplay, a practice Lesson at 80+ is followed by a Roleplay that can master the Unit", async () => {
    const clock = makeClock();
    const realtime = fakeRealtime();
    const step = mockTurns([fillGap()], [feedback(), fillGap()], [feedback(), fillGap()], [feedback(), { tool: "endLesson", input: {} }]);
    step.doGenerate = mockModel(lessonPlan()).doGenerate;
    const judge = mockModel({ skills: {}, objectiveProgress: 85, summary: "Nearly there." }, debriefReply({ objectiveProgress: 90 }));
    const app = makeApp({ now: clock, realtime, models: { step, judge } });
    const { cookie, units } = await learnerWithRoadmap(clock);
    // Only the last Unit ends with a Roleplay; skip ahead to it.
    for (const u of units.slice(0, -1)) await app.request(`/api/roadmap/units/${u.id}/skip`, json({}, cookie));
    const last = units.at(-1);
    expect(last.endsWithRoleplay).toBe(true);

    const practice = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
    expect(practice).toMatchObject({ kind: "practice", unitId: last.id });
    await (await app.request(`/api/lessons/${practice.id}/chat`, json({ message: userMessage("Let's start") }, cookie))).text();
    for (let i = 0; i < 3; i++) await answerStep(app, cookie, practice.id, { answer: "goes" });

    const res = await app.request("/api/lessons/next", json({}, cookie));
    expect(res.status).toBe(201);
    const roleplay = (await res.json()) as any;
    expect(roleplay).toMatchObject({ kind: "roleplay", unitId: last.id, roleplayKind: "mock_interview", tone: "standard", title: "Mock Interview" });

    await app.request(`/api/roleplays/${roleplay.id}/call`, sdp(cookie));
    const sb = realtime.sideband();
    for (const e of [...coachTurn("c1", "Tell me about yourself."), ...learnerTurn("u1", 0, 20_000, "I build payment systems.")]) sb.emit(e);
    expect((await app.request(`/api/roleplays/${roleplay.id}/end`, json({}, cookie))).status).toBe(200);

    // 85 then 90: two Lessons in a row at 80+.
    expect(((await (await app.request("/api/roadmap", get(cookie))).json()) as any[]).at(-1).status).toBe("mastered");
  });

  test("a Roleplay can't be driven through the practice chat", async () => {
    const app = makeApp();
    const { cookie } = await learnerWithRoadmap();
    const roleplay = await startRoleplay(app, cookie);

    expect((await app.request(`/api/lessons/${roleplay.id}/chat`, json({ message: userMessage("hi") }, cookie))).status).toBe(409);
  });
});
