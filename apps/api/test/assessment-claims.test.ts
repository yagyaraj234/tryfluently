import { expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { reportReply } from "./fixtures";
import {
  fakeRealtime,
  get,
  json,
  makeApp,
  makeClock,
  mockChat,
  mockModel,
  signUp,
  userMessage,
  WEB_ORIGIN,
} from "./helpers";
import { testDb } from "./setup";

const start = (app: ReturnType<typeof makeApp>, cookie: string) =>
  app.request("/api/assessments", json({ mode: "written" }, cookie));

async function existing(
  app: ReturnType<typeof makeApp>,
  clock: ReturnType<typeof makeClock>,
  mode: "written" | "voice" = "written",
) {
  const learner = await signUp(app);
  const [row] = await testDb
    .insert(schema.assessment)
    .values({ userId: learner.id, mode, startedAt: clock() })
    .returning();
  clock.advance({ seconds: 1 });
  const read = async () =>
    (await (await app.request(`/api/assessments/${row!.id}`, get(learner.cookie))).json()) as any;
  return { ...learner, id: row!.id, read };
}

test("starting another Assessment cannot finish one with a streaming chat", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const model = mockChat("Saved reply");
  const generate = model.doStream.bind(model);
  model.doStream = async (options) => {
    entered.resolve();
    await release.promise;
    return generate(options);
  };
  const clock = makeClock();
  const app = makeApp({ now: clock, models: { step: model } });
  const t = await existing(app, clock);
  const chat = await app.request(
    `/api/assessments/${t.id}/chat`,
    json({ message: userMessage("My answer") }, t.cookie),
  );
  const body = chat.text();
  try {
    await entered.promise;
    expect((await start(app, t.cookie)).status).toBe(409);
    expect(await t.read()).toMatchObject({ status: "in_progress", transcript: [] });
  } finally {
    release.resolve();
    await body;
  }
  expect((await t.read()).transcript).toHaveLength(2);
  expect((await start(app, t.cookie)).status).toBe(201);
  expect(await t.read()).toMatchObject({ status: "discarded" });
});

test("automatic finishing keeps its conversation claim until the Report is saved", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const ok = mockModel(reportReply());
  const report = new MockLanguageModelV4({
    doGenerate: async (options) => {
      entered.resolve();
      await release.promise;
      return ok.doGenerate(options);
    },
  });
  const clock = makeClock();
  const app = makeApp({ now: clock, models: { report } });
  const t = await existing(app, clock);
  clock.advance({ minutes: 5 });
  const pending = start(app, t.cookie);
  try {
    await entered.promise;
    expect(
      (await app.request(`/api/assessments/${t.id}/chat`, json({ message: userMessage("Too late") }, t.cookie))).status,
    ).toBe(409);
    expect(
      (
        await app.request(`/api/assessments/${t.id}/call`, {
          method: "POST",
          headers: { cookie: t.cookie, origin: WEB_ORIGIN },
          body: "v=0",
        })
      ).status,
    ).toBe(409);
  } finally {
    release.resolve();
    expect((await pending).status).toBe(429);
  }
  expect(await t.read()).toMatchObject({ status: "completed", transcript: [] });
  expect(
    (await app.request(`/api/assessments/${t.id}/chat`, json({ message: userMessage("Ended") }, t.cookie))).status,
  ).toBe(409);
});

test("starting another Assessment cannot finish a Voice Assessment during its call handshake", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const realtime = fakeRealtime();
  const create = realtime.createCall.bind(realtime);
  realtime.createCall = async (...args) => {
    entered.resolve();
    await release.promise;
    return create(...args);
  };
  const clock = makeClock();
  const app = makeApp({ now: clock, realtime });
  const t = await existing(app, clock, "voice");
  const pending = app.request(`/api/assessments/${t.id}/call`, {
    method: "POST",
    headers: { cookie: t.cookie, origin: WEB_ORIGIN },
    body: "v=0",
  });
  try {
    await entered.promise;
    expect((await start(app, t.cookie)).status).toBe(409);
    expect(await t.read()).toMatchObject({ status: "in_progress" });
  } finally {
    release.resolve();
    expect((await pending).status).toBe(201);
  }
  await realtime.sideband().emit({
    type: "conversation.item.input_audio_transcription.completed",
    item_id: "answer",
    transcript: "Keep my answer.",
  });
  expect((await start(app, t.cookie)).status).toBe(201);
  expect(realtime.sideband().hungUp).toBe(true);
  expect(await t.read()).toMatchObject({
    status: "discarded",
    transcript: [{ role: "user", parts: [{ type: "text", text: "Keep my answer." }] }],
  });
});

test("a written reply cannot save after another instance has ended the Assessment", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const model = mockChat("Late reply");
  const generate = model.doStream.bind(model);
  model.doStream = async (options) => {
    entered.resolve();
    await release.promise;
    return generate(options);
  };
  const clock = makeClock();
  const app = makeApp({ now: clock, models: { step: model } });
  const t = await existing(app, clock);
  const chat = await app.request(
    `/api/assessments/${t.id}/chat`,
    json({ message: userMessage("Late answer") }, t.cookie),
  );
  const body = chat.text().then(
    (value) => value,
    () => "failed",
  );
  try {
    await entered.promise;
    const otherInstance = makeApp({ now: clock });
    expect((await otherInstance.request(`/api/assessments/${t.id}/end`, json({}, t.cookie))).status).toBe(200);
  } finally {
    release.resolve();
    const result = await body;
    expect(result === "failed" || result.includes('"type":"error"')).toBe(true);
  }
  expect(await t.read()).toMatchObject({ status: "discarded", transcript: [] });
});

test("late voice transcript callbacks cannot write to an ended Assessment", async () => {
  const realtime = fakeRealtime();
  const clock = makeClock();
  const app = makeApp({ now: clock, realtime });
  const t = await existing(app, clock, "voice");
  expect(
    (
      await app.request(`/api/assessments/${t.id}/call`, {
        method: "POST",
        headers: { cookie: t.cookie, origin: WEB_ORIGIN },
        body: "v=0",
      })
    ).status,
  ).toBe(201);
  await testDb
    .update(schema.assessment)
    .set({ status: "discarded", endedAt: clock() })
    .where(eq(schema.assessment.id, t.id));
  await realtime
    .sideband()
    .emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "late", transcript: "Too late." });
  await realtime.sideband().close();
  expect(await t.read()).toMatchObject({ status: "discarded", transcript: [] });
});
