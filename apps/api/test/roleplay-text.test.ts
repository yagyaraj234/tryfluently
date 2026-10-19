import { describe, expect, test } from "bun:test";
import { schema } from "@impromptu/db";
import { and, eq } from "drizzle-orm";
import { learnerWithRoadmap } from "./fixtures";
import {
  fakeRealtime,
  get,
  json,
  makeApp,
  makeClock,
  mockChat,
  mockModel,
  userMessage,
  WEB_ORIGIN,
  type TestApp,
} from "./helpers";
import { testDb } from "./setup";

const debrief = {
  overallImpression: "Clear answers in writing, with a few tense slips.",
  questions: [
    {
      question: "Tell me about yourself.",
      quote: "I am working in fintech since four years.",
      strongerPhrasing: "I've been working in fintech for four years.",
      languageIssues: ["Present perfect continuous with 'for'"],
    },
  ],
  // The judge may still return fluency; a text-mode Roleplay must ignore it.
  skills: {
    grammar: { score: 62, evidence: [] },
    vocabulary: { score: 55, evidence: [] },
    fluency: { score: 90, evidence: [] },
  },
  phrasesToLearn: ["I've been working in … for …", "One challenge I faced was …", "That's a great question."],
  objectiveProgress: 70,
  summary: "Text Mock Interview: good structure, tense slips.",
};

const sdp = (cookie: string) => ({
  method: "POST",
  headers: { "content-type": "application/sdp", origin: WEB_ORIGIN, cookie },
  body: "v=0\r\n",
});

const goalOf = async (app: TestApp, cookie: string) =>
  ((await (await app.request("/api/goals", get(cookie))).json()) as any[])[0];

const startRoleplay = async (app: TestApp, cookie: string, body: Record<string, unknown> = {}) => {
  const goal = await goalOf(app, cookie);
  return (await (await app.request("/api/roleplays", json({ goalId: goal.id, ...body }, cookie))).json()) as any;
};

async function chat(app: TestApp, cookie: string, id: string, text: string) {
  const res = await app.request(`/api/roleplays/${id}/chat`, json({ message: userMessage(text) }, cookie));
  return { res, body: res.ok ? await res.text() : await res.json() };
}

describe("text-mode Roleplay", () => {
  test("a Roleplay started in text runs as a chat in character and ends with a Debrief labelled text mode", async () => {
    const step = mockChat(
      "Thanks for coming in. Tell me about yourself.",
      "Tell me about a time you disagreed with a teammate.",
    );
    const judge = mockModel(debrief);
    const app = makeApp({ models: { step, judge } });
    const { cookie, id: learnerId } = await learnerWithRoadmap();
    const goal = await goalOf(app, cookie);

    const start = await app.request("/api/roleplays", json({ goalId: goal.id, textMode: true, tone: "tough" }, cookie));
    expect(start.status).toBe(201);
    const roleplay = (await start.json()) as any;
    expect(roleplay).toMatchObject({ roleplayKind: "mock_interview", tone: "tough", textMode: true });

    const first = await chat(app, cookie, roleplay.id, "Hello, I'm ready.");
    expect(first.res.status).toBe(200);
    expect(first.body).toContain("Tell me about yourself.");
    await chat(app, cookie, roleplay.id, "I am working in fintech since four years.");
    // Same character and tone as the spoken Roleplay.
    const prompt = JSON.stringify(step.doStreamCalls[0]!.prompt);
    expect(prompt).toContain("interviewer in a Mock Interview");
    expect(prompt).toContain("Tough");
    expect(prompt).toContain("base the next question or follow-up on details in that last answer");
    expect(prompt).toContain("Do not agree, praise, reassure, or validate");

    const end = await app.request(`/api/roleplays/${roleplay.id}/end`, json({}, cookie));
    expect(end.status).toBe(200);
    expect(await end.json()).toMatchObject({ status: "completed", debrief: { textMode: true } });
    expect(JSON.stringify(judge.doGenerateCalls[0]!.prompt)).toContain("I am working in fintech since four years.");

    const done = (await (await app.request(`/api/lessons/${roleplay.id}`, get(cookie))).json()) as any;
    expect(done).toMatchObject({ status: "completed", textMode: true, debrief: { textMode: true } });
    expect(done.steps).toEqual([expect.objectContaining({ type: "roleplayTurn", mode: "text" })]);

    // No live call and no Realtime minutes used.
    const realtimeRows = await testDb
      .select()
      .from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.userId, learnerId), eq(schema.aiUsage.kind, "realtime")));
    expect(realtimeRows).toEqual([]);
  });

  test("a text-mode Roleplay moves grammar and vocabulary but never fluency", async () => {
    const clock = makeClock();
    const app = makeApp({
      now: clock,
      models: { step: mockChat("Tell me about yourself."), judge: mockModel(debrief) },
    });
    const { cookie } = await learnerWithRoadmap(clock);
    clock.advance({ minutes: 1 });
    const roleplay = await startRoleplay(app, cookie, { textMode: true });
    await chat(app, cookie, roleplay.id, "I am working in fintech since four years.");
    await app.request(`/api/roleplays/${roleplay.id}/end`, json({}, cookie));

    // From the Assessment: grammar 42, vocabulary 55, fluency not measured. 42 + 0.15 × (62 − 42) = 45.
    expect(await (await app.request("/api/skill-profile", get(cookie))).json()).toMatchObject({
      fluency: null,
      grammar: { score: 45 },
      vocabulary: { score: 55 },
    });
  });

  test("a Roleplay switches to text when the Learner chats before any call, and then can't start one", async () => {
    const realtime = fakeRealtime();
    const app = makeApp({ realtime, models: { step: mockChat("Tell me about yourself.") } });
    const { cookie } = await learnerWithRoadmap();
    const roleplay = await startRoleplay(app, cookie);
    expect(roleplay.textMode).toBe(false);

    expect((await chat(app, cookie, roleplay.id, "Hi")).res.status).toBe(200);
    expect(await (await app.request(`/api/lessons/${roleplay.id}`, get(cookie))).json()).toMatchObject({
      textMode: true,
    });

    expect((await app.request(`/api/roleplays/${roleplay.id}/call`, sdp(cookie))).status).toBe(409);
    expect(realtime.calls).toHaveLength(0);
  });

  test("a spoken Roleplay that has started can't be continued as a text chat", async () => {
    const realtime = fakeRealtime();
    const app = makeApp({ realtime });
    const { cookie } = await learnerWithRoadmap();
    const roleplay = await startRoleplay(app, cookie);
    await app.request(`/api/roleplays/${roleplay.id}/call`, sdp(cookie));
    realtime
      .sideband()
      .emit({ type: "response.output_audio_transcript.done", item_id: "c1", transcript: "Tell me about yourself." });

    expect((await chat(app, cookie, roleplay.id, "Hi")).res.status).toBe(409);
  });

  test("a malformed message is rejected, and someone else's Roleplay is out of reach", async () => {
    const app = makeApp();
    const asha = await learnerWithRoadmap();
    const ravi = await learnerWithRoadmap();
    const roleplay = await startRoleplay(app, asha.cookie, { textMode: true });

    const bad = await app.request(
      `/api/roleplays/${roleplay.id}/chat`,
      json({ message: { role: "user", parts: "hi" } }, asha.cookie),
    );
    expect(bad.status).toBe(400);
    expect((await chat(app, ravi.cookie, roleplay.id, "Hi")).res.status).toBe(404);
  });
});
