import { describe, expect, test } from "bun:test";
import { answerStep, feedback, fillGap, learnerWithRoadmap, lessonPlan } from "./fixtures";
import { get, json, makeApp, makeClock, mockModel, mockTurns, userMessage, type TestApp, type Turn } from "./helpers";

const lessonOf = async (app: TestApp, cookie: string, id: string) =>
  (await (await app.request(`/api/lessons/${id}`, get(cookie))).json()) as any;

const toolNames = (call: any) => (call.tools ?? []).map((t: any) => t.name).sort();

// An app whose step model plans one Lesson and then plays the given chat turns.
function lessonApp(turns: Turn[], clock = makeClock()) {
  const step = mockTurns(...turns);
  step.doGenerate = mockModel(lessonPlan()).doGenerate;
  const judge = mockModel({ skills: { fluency: null, grammar: null, vocabulary: null }, objectiveProgress: 50, summary: "Practised present simple.", focusItems: null });
  return { app: makeApp({ now: clock, models: { step, judge } }), step, clock };
}

async function startLesson(app: TestApp, cookie: string) {
  const res = await app.request("/api/lessons/next", json({}, cookie));
  const lesson = (await res.json()) as any;
  await (await app.request(`/api/lessons/${lesson.id}/chat`, json({ message: userMessage("Let's start") }, cookie))).text();
  return { res, lesson };
}

describe("lesson chat with fillGap", () => {
  test("starting the next Lesson generates it with a title, objective and kind from the active Unit", async () => {
    const step = mockModel(lessonPlan());
    const app = makeApp({ models: { step } });
    const { cookie, units } = await learnerWithRoadmap();

    const res = await app.request("/api/lessons/next", json({}, cookie));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      unitId: units[0].id,
      position: 0,
      kind: "practice",
      status: "in_progress",
      title: "Present simple for routines",
      objective: "Use present simple for daily routines",
    });
    const prompt = JSON.stringify(step.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain(units[0].objective);
    expect(prompt).toContain("Past simple vs present perfect"); // open Focus Item
  });

  test("a fillGap Step round-trips: the answer comes back, giveFeedback runs and the next Step follows", async () => {
    const { app, step } = lessonApp([[fillGap()], [feedback(), fillGap("They ___ football on Sundays.", "play")]]);
    const { cookie } = await learnerWithRoadmap();
    const { lesson } = await startLesson(app, cookie);

    const pending = (await lessonOf(app, cookie, lesson.id)).messages.at(-1).parts.find((p: any) => p.type === "tool-fillGap");
    expect(pending).toMatchObject({ state: "input-available", input: { sentence: "She ___ to work every day." } });

    const res = await answerStep(app, cookie, lesson.id, { answer: "goes" });
    expect(res.status).toBe(200);

    const after = await lessonOf(app, cookie, lesson.id);
    expect(after.steps).toEqual([
      expect.objectContaining({
        position: 0,
        type: "fillGap",
        mode: "text",
        input: expect.objectContaining({ sentence: "She ___ to work every day.", answer: "goes" }),
        output: expect.objectContaining({ answer: "goes" }),
        feedback: { verdict: "correct", corrected: "She goes to work every day.", explanation: expect.any(String) },
      }),
    ]);
    const parts = after.messages.at(-1).parts.filter((p: any) => p.type.startsWith("tool-"));
    expect(parts.map((p: any) => p.type)).toEqual(["tool-fillGap", "tool-giveFeedback", "tool-fillGap"]);
    // The model was told the server's grade.
    expect(JSON.stringify(step.doStreamCalls[1]!.prompt)).toContain('"correct":true');
  });

  test("fillGap is graded by exact match on the server, whatever the model says", async () => {
    const { app, step } = lessonApp([[fillGap()], [feedback("correct"), fillGap()], [feedback("incorrect"), fillGap()]]);
    const { cookie } = await learnerWithRoadmap();
    const { lesson } = await startLesson(app, cookie);

    await answerStep(app, cookie, lesson.id, { answer: "went" });
    await answerStep(app, cookie, lesson.id, { answer: "  Goes " });

    const { steps } = await lessonOf(app, cookie, lesson.id);
    expect(steps.map((s: any) => s.feedback.verdict)).toEqual(["incorrect", "correct"]);
    expect(JSON.stringify(step.doStreamCalls[1]!.prompt)).toContain('"correct":false');
  });

  test("endLesson isn't offered before 3 Steps, is offered from 3, and is forced at 10", async () => {
    const turns: Turn[] = [[fillGap()], ...Array.from({ length: 9 }, () => [feedback(), fillGap()]), [feedback(), { tool: "endLesson", input: {} }]];
    const { app, step } = lessonApp(turns);
    const { cookie } = await learnerWithRoadmap();
    const { lesson } = await startLesson(app, cookie);
    for (let i = 0; i < 10; i++) expect((await answerStep(app, cookie, lesson.id, { answer: "goes" })).status).toBe(200);

    const calls = step.doStreamCalls;
    // Call n is made after n answers.
    expect(toolNames(calls[0])).toEqual(["fillGap", "fillGaps", "reorder", "rewrite", "speakPrompt", "vocabCard"]);
    expect(toolNames(calls[2])).toEqual(["fillGap", "fillGaps", "giveFeedback", "reorder", "rewrite", "speakPrompt", "vocabCard"]);
    expect(toolNames(calls[3])).toEqual(["endLesson", "fillGap", "fillGaps", "giveFeedback", "reorder", "rewrite", "speakPrompt", "vocabCard"]);
    expect(toolNames(calls[9])).toEqual(["endLesson", "fillGap", "fillGaps", "giveFeedback", "reorder", "rewrite", "speakPrompt", "vocabCard"]);
    expect(toolNames(calls[10])).toEqual(["endLesson", "giveFeedback"]);
    expect(calls[10]!.toolChoice).toEqual({ type: "required" });

    const done = await lessonOf(app, cookie, lesson.id);
    expect(done).toMatchObject({ status: "completed" });
    expect(done.steps).toHaveLength(10);
  });

  test("closing mid-Lesson and coming back resumes from the last finished Step", async () => {
    const clock = makeClock();
    const { app } = lessonApp([[fillGap()], [feedback(), fillGap("They ___ football.", "play")]], clock);
    const { cookie } = await learnerWithRoadmap(clock);
    const { lesson } = await startLesson(app, cookie);
    await answerStep(app, cookie, lesson.id, { answer: "goes" });

    // A fresh app, as after a restart: asking for the next Lesson gives back the one in progress.
    const later = makeApp({ now: clock });
    const resumed = await later.request("/api/lessons/next", json({}, cookie));
    expect(resumed.status).toBe(200);
    const body = (await resumed.json()) as any;
    expect(body.id).toBe(lesson.id);
    expect(body.steps).toHaveLength(1);
    expect(body.messages.at(-1).parts.at(-1)).toMatchObject({ state: "input-available", input: { sentence: "They ___ football." } });
  });

  test("malformed tool output from the client is rejected and no Step is stored", async () => {
    const { app } = lessonApp([[fillGap()]]);
    const { cookie } = await learnerWithRoadmap();
    const { lesson } = await startLesson(app, cookie);

    expect((await answerStep(app, cookie, lesson.id, { answer: 42 })).status).toBe(400);
    expect((await answerStep(app, cookie, lesson.id, {})).status).toBe(400);
    expect((await lessonOf(app, cookie, lesson.id)).steps).toEqual([]);
  });

  test("the client can't change a Step's question or answer key when it returns the answer", async () => {
    const { app } = lessonApp([[fillGap()], [feedback(), fillGap()]]);
    const { cookie } = await learnerWithRoadmap();
    const { lesson } = await startLesson(app, cookie);

    const stored = await lessonOf(app, cookie, lesson.id);
    const last = stored.messages.at(-1);
    const tampered = {
      ...last,
      parts: last.parts.map((p: any) =>
        p.type === "tool-fillGap" ? { ...p, input: { ...p.input, answer: "went" }, state: "output-available", output: { answer: "went" } } : p,
      ),
    };
    await (await app.request(`/api/lessons/${lesson.id}/chat`, json({ message: tampered }, cookie))).text();

    const { steps } = await lessonOf(app, cookie, lesson.id);
    expect(steps[0]).toMatchObject({ input: { answer: "goes" }, feedback: { verdict: "incorrect" } });
  });

  test("a Learner can't open someone else's Lesson", async () => {
    const { app } = lessonApp([]);
    const asha = await learnerWithRoadmap();
    const ravi = await learnerWithRoadmap();
    const lesson = (await (await app.request("/api/lessons/next", json({}, asha.cookie))).json()) as any;

    expect((await app.request(`/api/lessons/${lesson.id}`, get(ravi.cookie))).status).toBe(404);
    expect((await app.request(`/api/lessons/${lesson.id}/chat`, json({ message: userMessage("hi") }, ravi.cookie))).status).toBe(404);
  });
});

const vocabCard = {
  tool: "vocabCard",
  input: { word: "deadline", meaning: "the time by which something must be done", example: "The deadline for the report is Friday." },
};
const rewrite = {
  tool: "rewrite",
  input: { sentence: "I am very very happy with the result.", aim: "Sound more natural by replacing 'very very'." },
};

describe("vocabCard and rewrite Steps", () => {
  test.each([
    ["vocabCard", vocabCard, "We missed the deadline because the API was late.", "almost"],
    ["rewrite", rewrite, "I'm delighted with the result.", "correct"],
  ] as const)("a %s Step round-trips: the Learner's sentence gets giveFeedback and a stored Step", async (type, stepCall, answer, verdict) => {
    const judged = { tool: "giveFeedback", input: { verdict, corrected: answer, explanation: "Nice and natural." } };
    const { app, step } = lessonApp([[stepCall], [judged, fillGap()]]);
    const { cookie } = await learnerWithRoadmap();
    const { lesson } = await startLesson(app, cookie);

    const pending = (await lessonOf(app, cookie, lesson.id)).messages.at(-1).parts.find((p: any) => p.type === `tool-${type}`);
    expect(pending).toMatchObject({ state: "input-available", input: stepCall.input });

    expect((await answerStep(app, cookie, lesson.id, { answer })).status).toBe(200);
    const { steps } = await lessonOf(app, cookie, lesson.id);
    expect(steps).toEqual([
      expect.objectContaining({
        type,
        mode: "text",
        input: stepCall.input,
        output: { answer },
        // No server grade: the model's verdict stands.
        feedback: { verdict, corrected: answer, explanation: "Nice and natural." },
      }),
    ]);
    // The model judged the Learner's own words.
    expect(JSON.stringify(step.doStreamCalls[1]!.prompt)).toContain(answer);
  });

  test.each([
    ["vocabCard", vocabCard],
    ["rewrite", rewrite],
  ] as const)("a malformed %s answer is rejected and no Step is stored", async (_type, stepCall) => {
    const { app } = lessonApp([[stepCall]]);
    const { cookie } = await learnerWithRoadmap();
    const { lesson } = await startLesson(app, cookie);

    expect((await answerStep(app, cookie, lesson.id, { answer: "   " })).status).toBe(400);
    expect((await answerStep(app, cookie, lesson.id, { sentence: "I'm delighted." })).status).toBe(400);
    expect((await lessonOf(app, cookie, lesson.id)).steps).toEqual([]);
  });

  test("a Step the model calls with missing fields is never put to the Learner", async () => {
    const { app } = lessonApp([[{ tool: "vocabCard", input: { word: "deadline" } }]]);
    const { cookie } = await learnerWithRoadmap();
    const { lesson } = await startLesson(app, cookie);

    const part = (await lessonOf(app, cookie, lesson.id)).messages.at(-1).parts.find((p: any) => p.type === "tool-vocabCard");
    expect(part.state).not.toBe("input-available");
  });
});


describe("structured Lesson Steps", () => {
  for (const item of [
    { tool: "fillGaps", input: { sentence: "I ___ here, and she ___ there.", answers: ["work", "works"], choices: ["work", "works"], teaching: { title: "Subject agreement", body: "Match each verb to its subject." } }, answer: '[" Work ","WORKS"]' },
    { tool: "reorder", input: { prompt: "Arrange a polite request.", items: ["help?", "Could you"], order: [1, 0] }, answer: '[1,0]' },
  ]) {
    test(`${item.tool} persists teaching/input and the server's verdict`, async () => {
      const { app } = lessonApp([[item], [feedback("incorrect"), fillGap()]]);
      const { cookie } = await learnerWithRoadmap();
      const { lesson } = await startLesson(app, cookie);
      expect((await answerStep(app, cookie, lesson.id, { answer: item.answer })).status).toBe(200);
      const saved = await lessonOf(app, cookie, lesson.id);
      expect(saved.steps[0]).toMatchObject({ type: item.tool, input: item.input, feedback: { verdict: "correct" } });
    });
  }
});
