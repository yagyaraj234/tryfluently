import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { and, eq } from "drizzle-orm";
import { answerStep, feedback, fillGap, learnerWithLegacyRoadmap as learnerWithRoadmap, lessonPlan } from "./fixtures";
import {
  fakeTranscriber,
  get,
  json,
  makeApp,
  makeClock,
  mockModel,
  mockTurns,
  userMessage,
  WEB_ORIGIN,
  type TestApp,
  type Turn,
} from "./helpers";
import { testDb } from "./setup";

const speakPrompt = {
  tool: "speakPrompt",
  input: { question: "Tell me about your morning routine.", targetSeconds: 60 },
};
const vocabCard = {
  tool: "vocabCard",
  input: { word: "deadline", meaning: "the time something is due", example: "The deadline is Friday." },
};
const rewrite = { tool: "rewrite", input: { sentence: "I am very very happy.", aim: "Sound more natural." } };
const end = { tool: "endLesson", input: {} };
const said = "I usually start my day with a short walk and then check my emails.";

type Opts = {
  judge?: unknown;
  transcriber?: ReturnType<typeof fakeTranscriber>;
  clock?: ReturnType<typeof makeClock>;
  minutes?: number;
};

function voiceApp(turns: Turn[], { judge, transcriber = fakeTranscriber(), clock = makeClock(), minutes }: Opts = {}) {
  const step = mockTurns(...turns);
  step.doGenerate = mockModel(lessonPlan(), lessonPlan()).doGenerate;
  const judgeModel = mockModel(
    judge ?? {
      skills: { fluency: null, grammar: null, vocabulary: null },
      objectiveProgress: 50,
      summary: "Spoke about routines.",
      focusItems: null,
    },
  );
  const app = makeApp({
    now: clock,
    transcriber,
    models: { step, judge: judgeModel },
    settings: minutes === undefined ? undefined : { recordingMinutesPerDay: minutes },
  });
  return { app, step, judgeModel, transcriber, clock };
}

async function startLesson(app: TestApp, cookie: string) {
  const lesson = (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any;
  await (
    await app.request(`/api/lessons/${lesson.id}/chat`, json({ message: userMessage("Let's start") }, cookie))
  ).text();
  return lesson;
}

function record(
  app: TestApp,
  cookie: string,
  lessonId: string,
  seconds: number | string = 45,
  audio: Blob | null = new Blob(["fake-opus"], { type: "audio/webm" }),
) {
  const form = new FormData();
  if (audio) form.append("audio", audio, "answer.webm");
  form.append("seconds", String(seconds));
  return app.request(`/api/lessons/${lessonId}/recordings`, {
    method: "POST",
    headers: { cookie, origin: WEB_ORIGIN },
    body: form,
  });
}

const lessonOf = async (app: TestApp, cookie: string, id: string) =>
  (await (await app.request(`/api/lessons/${id}`, get(cookie))).json()) as any;

describe("recorded voice Steps", () => {
  test("a speakPrompt round-trips: recording → transcript and timing → giveFeedback → stored Step", async () => {
    const { app, step, transcriber } = voiceApp([
      [speakPrompt],
      [feedback("almost", "I usually start my day with a short walk."), fillGap()],
    ]);
    const { cookie } = await learnerWithRoadmap();
    const lesson = await startLesson(app, cookie);

    const res = await record(app, cookie, lesson.id, 45);
    expect(res.status).toBe(201);
    const { recordingId, ...transcribed } = (await res.json()) as any;
    expect(recordingId).toEqual(expect.any(String));
    expect(transcribed).toEqual({ text: said, timing: { seconds: 45, words: 14, wpm: 18.7 } });
    expect(transcriber.calls).toHaveLength(1);

    expect((await answerStep(app, cookie, lesson.id, { recordingId })).status).toBe(200);
    const { steps } = await lessonOf(app, cookie, lesson.id);
    expect(steps).toEqual([
      expect.objectContaining({
        type: "speakPrompt",
        mode: "voice",
        output: { answer: said },
        timing: { seconds: 45, words: 14, wpm: 18.7 },
        feedback: expect.objectContaining({ verdict: "almost" }),
      }),
    ]);
    // The model judged the transcript.
    expect(JSON.stringify(step.doStreamCalls[1]!.prompt)).toContain(said);
  });

  test.each([
    ["vocabCard", vocabCard],
    ["rewrite", rewrite],
  ] as const)("a %s Step accepts a recorded answer", async (type, stepCall) => {
    const { app } = voiceApp([[stepCall], [feedback(), fillGap()]], {
      transcriber: fakeTranscriber("We missed the deadline."),
    });
    const { cookie } = await learnerWithRoadmap();
    const lesson = await startLesson(app, cookie);

    const { recordingId } = (await (await record(app, cookie, lesson.id, 4)).json()) as any;
    await answerStep(app, cookie, lesson.id, { recordingId });
    expect((await lessonOf(app, cookie, lesson.id)).steps[0]).toMatchObject({
      type,
      mode: "voice",
      output: { answer: "We missed the deadline." },
    });
  });

  test("switching a voice Step to text is recorded on the Step", async () => {
    const { app } = voiceApp([[speakPrompt], [feedback(), fillGap()]]);
    const { cookie } = await learnerWithRoadmap();
    const lesson = await startLesson(app, cookie);

    await answerStep(app, cookie, lesson.id, { answer: "I walk, then I read my emails." });
    expect((await lessonOf(app, cookie, lesson.id)).steps[0]).toMatchObject({
      type: "speakPrompt",
      mode: "text",
      timing: null,
    });
  });

  test("the client can't pass off its own transcript: only recordings this Learner made for this Lesson count", async () => {
    const { app } = voiceApp([[speakPrompt], [speakPrompt]]);
    const asha = await learnerWithRoadmap();
    const ravi = await learnerWithRoadmap();
    const ashaLesson = await startLesson(app, asha.cookie);
    const raviLesson = await startLesson(app, ravi.cookie);
    const { recordingId } = (await (await record(app, ravi.cookie, raviLesson.id)).json()) as any;

    expect((await answerStep(app, asha.cookie, ashaLesson.id, { recordingId })).status).toBe(400);
    expect((await answerStep(app, asha.cookie, ashaLesson.id, { recordingId: crypto.randomUUID() })).status).toBe(400);
    expect((await lessonOf(app, asha.cookie, ashaLesson.id)).steps).toEqual([]);
  });

  test("each recording writes a recording ai_usage row with its length; no audio is kept", async () => {
    const { app } = voiceApp([[speakPrompt]]);
    const { cookie, id } = await learnerWithRoadmap();
    const lesson = await startLesson(app, cookie);
    await record(app, cookie, lesson.id, 52);

    const rows = await testDb
      .select()
      .from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.userId, id), eq(schema.aiUsage.kind, "recording")));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seconds: 52 });
    expect(JSON.stringify(rows[0])).not.toContain("fake-opus");
  });

  test("recordings are refused once the day's recorded minutes are used up, and allowed again the next local day", async () => {
    const clock = makeClock("2026-10-15T12:00:00Z"); // 17:30 in Kolkata
    const { app } = voiceApp([[speakPrompt]], { clock, minutes: 2 });
    const { cookie } = await learnerWithRoadmap(clock, { timezone: "Asia/Kolkata" });
    const lesson = await startLesson(app, cookie);

    expect((await record(app, cookie, lesson.id, 70)).status).toBe(201);
    expect((await record(app, cookie, lesson.id, 50)).status).toBe(201);
    const refused = await record(app, cookie, lesson.id, 10);
    expect(refused.status).toBe(429);
    expect(JSON.stringify(await refused.json())).toContain("recorded minutes");

    clock.set("2026-10-15T18:29:00Z"); // 23:59 in Kolkata, the same local day
    expect((await record(app, cookie, lesson.id, 10)).status).toBe(429);
    clock.set("2026-10-15T18:30:00Z"); // local midnight
    expect((await record(app, cookie, lesson.id, 10)).status).toBe(201);
  });

  test("a recording needs audio and a sensible length", async () => {
    const { app } = voiceApp([[speakPrompt]]);
    const { cookie } = await learnerWithRoadmap();
    const lesson = await startLesson(app, cookie);

    expect((await record(app, cookie, lesson.id, 45, null)).status).toBe(400);
    expect((await record(app, cookie, lesson.id, 0)).status).toBe(400);
    expect((await record(app, cookie, lesson.id, 600)).status).toBe(400);
    expect((await record(app, cookie, lesson.id, "abc")).status).toBe(400);
  });

  test("a Learner can't record into someone else's Lesson", async () => {
    const { app } = voiceApp([[speakPrompt]]);
    const asha = await learnerWithRoadmap();
    const ravi = await learnerWithRoadmap();
    const lesson = await startLesson(app, asha.cookie);
    expect((await record(app, ravi.cookie, lesson.id)).status).toBe(404);
  });
});

describe("fluency from voice Steps only", () => {
  const fluentJudge = {
    skills: { fluency: { score: 90, evidence: ["smooth"] }, grammar: { score: 50, evidence: [] }, vocabulary: null },
    objectiveProgress: 50,
    summary: "Talked about routines.",
    focusItems: null,
  };
  const threeSteps = (stepCall: Turn[number]): Turn[] => [
    [stepCall],
    [feedback(), stepCall],
    [feedback(), stepCall],
    [feedback(), end],
  ];

  test("a Lesson done entirely in text doesn't change fluency, even if the judge scores it", async () => {
    const { app, clock } = voiceApp(threeSteps(speakPrompt), { judge: fluentJudge });
    const { cookie } = await learnerWithRoadmap(clock);
    clock.advance({ minutes: 5 });
    const lesson = await startLesson(app, cookie);
    for (let i = 0; i < 3; i++) await answerStep(app, cookie, lesson.id, { answer: "I walk to work." });

    const profile = (await (await app.request("/api/skill-profile", get(cookie))).json()) as any;
    expect(profile.fluency).toBeNull();
    // Grammar still moves: 42 + 0.15 × (50 − 42) ≈ 43
    expect(profile.grammar).toMatchObject({ score: 43 });
  });

  test("a voice Lesson can change fluency, and the judge sees the speaking timing", async () => {
    const { app, judgeModel } = voiceApp(threeSteps(speakPrompt), { judge: fluentJudge });
    const { cookie } = await learnerWithRoadmap();
    const lesson = await startLesson(app, cookie);
    for (let i = 0; i < 3; i++) {
      const { recordingId } = (await (await record(app, cookie, lesson.id, 45)).json()) as any;
      await answerStep(app, cookie, lesson.id, { recordingId });
    }

    expect(((await (await app.request("/api/skill-profile", get(cookie))).json()) as any).fluency).toMatchObject({
      score: 90,
    });
    expect(JSON.stringify(judgeModel.doGenerateCalls[0]!.prompt)).toContain("wpm");
  });
});
