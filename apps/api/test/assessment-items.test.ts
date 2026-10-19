import { describe, expect, test } from "bun:test";
import { answerStep, fillGap, reportReply } from "./fixtures";
import {
  get,
  json,
  makeApp,
  makeClock,
  mockModel,
  mockTurns,
  signUp,
  userMessage,
  type TestApp,
  type Turn,
} from "./helpers";

const rewrite = { tool: "rewrite", input: { sentence: "I am very very happy with it.", aim: "Sound more natural." } };
const toolNames = (call: any) => (call.tools ?? []).map((t: any) => t.name).sort();

const readAssessment = async (app: TestApp, cookie: string, id: string) =>
  (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;

function itemsApp(turns: Turn[]) {
  const clock = makeClock();
  const step = mockTurns(...turns);
  const report = mockModel(reportReply());
  return { app: makeApp({ now: clock, models: { step, report } }), step, report, clock };
}

async function start(app: TestApp, cookie: string) {
  const { id } = (await (await app.request("/api/assessments", json({ mode: "written" }, cookie))).json()) as {
    id: string;
  };
  await (
    await app.request(`/api/assessments/${id}/chat`, json({ message: userMessage("Hi, I'm ready.") }, cookie))
  ).text();
  return id;
}

const items = (answered: any) =>
  answered.transcript.flatMap((m: any) =>
    m.parts.filter((p: any) => p.type === "tool-fillGap" || p.type === "tool-rewrite"),
  );

describe("structured items in the Written Assessment", () => {
  test("the coach can pose fillGap and rewrite items in the chat, and the Learner answers them", async () => {
    const { app, step } = itemsApp([
      ["Let's try a quick one.", fillGap()],
      ["Thanks! Now this.", rewrite],
      ["Great, tell me about your work."],
    ]);
    const { cookie } = await signUp(app);
    const id = await start(app, cookie);

    expect(toolNames(step.doStreamCalls[0])).toEqual(["fillGap", "rewrite"]);
    expect((await answerStep(app, cookie, id, { answer: "goes" }, "assessments")).status).toBe(200);
    expect((await answerStep(app, cookie, id, { answer: "I'm delighted with it." }, "assessments")).status).toBe(200);

    expect(items(await readAssessment(app, cookie, id))).toEqual([
      expect.objectContaining({
        type: "tool-fillGap",
        state: "output-available",
        output: { answer: "goes", grade: { correct: true, expected: "goes" } },
      }),
      expect.objectContaining({
        type: "tool-rewrite",
        state: "output-available",
        output: { answer: "I'm delighted with it." },
      }),
    ]);
  });

  test("fillGap items are graded by exact match on the server, from the item the server stored", async () => {
    const { app, step } = itemsApp([[fillGap()], [fillGap()], ["Thanks."]]);
    const { cookie } = await signUp(app);
    const id = await start(app, cookie);

    await answerStep(app, cookie, id, { answer: "went" }, "assessments");
    // A tampered answer key is ignored: the stored item still expects "goes".
    const stored = (await readAssessment(app, cookie, id)).transcript.at(-1);
    const tampered = {
      ...stored,
      parts: stored.parts.map((p: any) =>
        p.state === "input-available"
          ? { ...p, input: { ...p.input, answer: "gone" }, state: "output-available", output: { answer: " Gone " } }
          : p,
      ),
    };
    await (await app.request(`/api/assessments/${id}/chat`, json({ message: tampered }, cookie))).text();

    expect(items(await readAssessment(app, cookie, id)).map((p: any) => p.output.grade)).toEqual([
      { correct: false, expected: "goes" },
      { correct: false, expected: "goes" },
    ]);
    expect(JSON.stringify(step.doStreamCalls[1]!.prompt)).toContain('"correct":false');
  });

  test("a malformed answer is rejected and nothing is stored", async () => {
    const { app } = itemsApp([[fillGap()]]);
    const { cookie } = await signUp(app);
    const id = await start(app, cookie);

    expect((await answerStep(app, cookie, id, { answer: 42 }, "assessments")).status).toBe(400);
    expect((await answerStep(app, cookie, id, {}, "assessments")).status).toBe(400);
    expect(items(await readAssessment(app, cookie, id))[0]).toMatchObject({ state: "input-available" });
  });

  test("a text message can't skip an item that is waiting for an answer", async () => {
    const { app } = itemsApp([[fillGap()]]);
    const { cookie } = await signUp(app);
    const id = await start(app, cookie);

    expect(
      (await app.request(`/api/assessments/${id}/chat`, json({ message: userMessage("skip") }, cookie))).status,
    ).toBe(409);
  });

  test("items stop being offered once 4 have been answered", async () => {
    const turns: Turn[] = [[fillGap()], [rewrite], [fillGap()], [rewrite], ["Tell me about your work."]];
    const { app, step } = itemsApp(turns);
    const { cookie } = await signUp(app);
    const id = await start(app, cookie);
    for (const answer of ["goes", "Better.", "goes", "Better."])
      await answerStep(app, cookie, id, { answer }, "assessments");

    expect(toolNames(step.doStreamCalls[3])).toEqual(["fillGap", "rewrite"]);
    expect(toolNames(step.doStreamCalls[4])).toEqual([]);
  });

  test("the Report is generated from the structured answers as well as the conversation", async () => {
    const { app, report, clock } = itemsApp([[fillGap()], [rewrite], ["Thanks, that's all."]]);
    const { cookie } = await signUp(app);
    const id = await start(app, cookie);
    await answerStep(app, cookie, id, { answer: "went" }, "assessments");
    await answerStep(app, cookie, id, { answer: "I'm delighted with it." }, "assessments");

    clock.advance({ minutes: 10 });
    expect((await app.request(`/api/assessments/${id}/end`, json({}, cookie))).status).toBe(200);

    const prompt = JSON.stringify(report.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain("She ___ to work every day.");
    expect(prompt).toContain("went");
    expect(prompt).toContain("incorrect");
    expect(prompt).toContain("I am very very happy with it.");
    expect(prompt).toContain("I'm delighted with it.");
  });
});
