import { expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { and, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { Hono } from "hono";
import type { AppEnv } from "../src/app";
import { analyseLesson } from "../src/lesson-analysis";
import { questionProblem } from "../src/lesson-blocks";
import { generateLesson } from "../src/paged-lessons";
import { requestLimits, PAID_REQUESTS_IN_FLIGHT, PAID_REQUESTS_PER_MINUTE } from "../src/request-limits";
import { recordScores, skillProfile } from "../src/scoring";
import {
  fakeRealtime,
  fakeTimers,
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

const question = { block: "fillGap" as const, prompt: "She ___ to work.", answer: "goes", explanation: "Use goes." };
const material = [{ title: "Verbs", body: "Match the subject.", example: null, block: "fillGap", question }];
async function paged(userId: string, extra: Partial<typeof schema.lesson.$inferInsert> = {}) {
  const [row] = await testDb
    .insert(schema.lesson)
    .values({
      userId,
      position: 0,
      kind: "practice",
      title: "Verbs",
      objective: "Use verbs",
      contentVersion: 2,
      preparation: "ready",
      pageStatus: [{ page: "ready", question: "ready" }],
      material,
      ...extra,
    })
    .returning();
  return row!;
}
const sdp = (cookie: string) => ({ method: "POST", headers: { cookie, origin: WEB_ORIGIN }, body: "v=0" });

for (const kind of ["assessments", "roleplays"] as const) {
  test(`${kind}: reconnect keeps both calls' transcripts`, async () => {
    const realtime = fakeRealtime();
    const clock = makeClock();
    const app = makeApp({ now: clock, realtime });
    const learner = await signUp(app);
    const [row] =
      kind === "assessments"
        ? await testDb
            .insert(schema.assessment)
            .values({ userId: learner.id, mode: "voice", startedAt: clock() })
            .returning()
        : await testDb
            .insert(schema.lesson)
            .values({
              userId: learner.id,
              kind: "roleplay",
              roleplayKind: "mock_interview",
              tone: "standard",
              position: 0,
              title: "Interview",
              objective: "Speak",
              startedAt: clock(),
            })
            .returning();
    for (const text of ["First answer", "Second answer"]) {
      expect((await app.request(`/api/${kind}/${row!.id}/call`, sdp(learner.cookie))).status).toBe(201);
      await realtime.sideband().emit({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: crypto.randomUUID(),
        transcript: text,
      });
      await realtime.sideband().close();
    }
    const table = kind === "assessments" ? schema.assessment : schema.lesson;
    const [saved] = await testDb.select().from(table).where(eq(table.id, row!.id));
    const messages = ("transcript" in saved! ? saved.transcript : saved!.messages) as UIMessage[];
    expect(messages.map((m) => m.parts[0])).toEqual(
      ["First answer", "Second answer"].map((text) => ({ type: "text", text })),
    );
  });
}

for (const kind of ["assessments", "roleplays", "lessons"] as const) {
  test(`${kind}: overlapping chat cannot overwrite a turn or finish during it`, async () => {
    const step = mockChat("First reply", "Second reply");
    const generate = step.doStream.bind(step);
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    step.doStream = async (options) => {
      entered.resolve();
      await release.promise;
      return generate(options);
    };
    const clock = makeClock();
    const app = makeApp({ now: clock, models: { step } });
    const learner = await signUp(app);
    const [row] =
      kind === "assessments"
        ? await testDb
            .insert(schema.assessment)
            .values({ userId: learner.id, mode: "written", startedAt: clock() })
            .returning()
        : await testDb
            .insert(schema.lesson)
            .values({
              userId: learner.id,
              kind: kind === "roleplays" ? "roleplay" : "practice",
              roleplayKind: "mock_interview",
              tone: "standard",
              textMode: true,
              position: 0,
              title: "Chat",
              objective: "Speak",
              startedAt: clock(),
            })
            .returning();
    const chat = (text: string) =>
      app.request(`/api/${kind}/${row!.id}/chat`, json({ message: userMessage(text) }, learner.cookie));
    const first = await chat("First answer");
    const body = first.text();
    try {
      await entered.promise;
      expect((await chat("Overlapping answer")).status).toBe(409);
      const encodedId = `%${row!.id.charCodeAt(0).toString(16)}${row!.id.slice(1)}`;
      expect(
        (
          await app.request(
            `/api/${kind}/${encodedId}/chat`,
            json({ message: userMessage("Encoded overlap") }, learner.cookie),
          )
        ).status,
      ).toBe(409);
      const end = kind === "lessons" ? "finish" : "end";
      expect((await app.request(`/api/${kind}/${row!.id}/${end}`, json({}, learner.cookie))).status).toBe(409);
    } finally {
      release.resolve();
      await body;
    }
    const second = await chat("Second answer");
    expect(second.status).toBe(200);
    await second.text();
    const table = kind === "assessments" ? schema.assessment : schema.lesson;
    const [saved] = await testDb.select().from(table).where(eq(table.id, row!.id));
    const messages = ("transcript" in saved! ? saved.transcript : saved!.messages) as UIMessage[];
    expect(messages.filter((m) => m.role === "user").map((m) => m.parts[0])).toEqual(
      ["First answer", "Second answer"].map((text) => ({ type: "text", text })),
    );
  });
}

test("paged completion requires generated questions and answers, and rejects abandoned Lessons", async () => {
  const app = makeApp();
  const learner = await signUp(app);
  for (const extra of [
    {
      preparationToken: "still-writing",
      pageStatus: [{ page: "ready", question: "pending" }],
      material: [{ ...material[0]!, question: undefined }],
    },
    { material: [{ ...material[0]!, question: undefined }] },
    {},
    { status: "abandoned" },
  ] as Partial<typeof schema.lesson.$inferInsert>[]) {
    const row = await paged(learner.id, extra);
    expect((await app.request(`/api/lessons/${row.id}/finish`, json({}, learner.cookie))).status).toBe(409);
    expect(
      await testDb.select().from(schema.assessmentJob).where(eq(schema.assessmentJob.lessonId, row.id)),
    ).toHaveLength(0);
  }
  const row = await paged(learner.id);
  expect(
    (await app.request(`/api/lessons/${row.id}/pages/0/answer`, json({ answer: "goes" }, learner.cookie))).status,
  ).toBe(201);
  expect((await app.request(`/api/lessons/${row.id}/finish`, json({}, learner.cookie))).status).toBe(200);
  expect((await app.request(`/api/lessons/${row.id}/finish`, json({}, learner.cookie))).status).toBe(200);
  expect(
    await testDb.select().from(schema.assessmentJob).where(eq(schema.assessmentJob.lessonId, row.id)),
  ).toHaveLength(1);
});

test("a final question-generation timeout fails the Lesson and permits retry", async () => {
  const app = makeApp();
  const learner = await signUp(app);
  const row = await paged(learner.id, {
    preparationToken: "resumed",
    pageStatus: [{ page: "ready", question: "pending" }],
  });
  const model = mockModel({ questions: [] });
  await expect(
    generateLesson(
      {
        db: testDb,
        now: makeClock(),
        models: { step: model, judge: model, brief: model, report: model, roadmap: model },
        signal: AbortSignal.abort(new Error("deadline")),
      },
      row.id,
      3,
    ),
  ).rejects.toThrow();
  const [saved] = await testDb.select().from(schema.lesson).where(eq(schema.lesson.id, row.id));
  expect(saved).toMatchObject({ preparation: "failed", preparationToken: null });
  expect((await app.request(`/api/lessons/${row.id}/retry`, json({}, learner.cookie))).status).toBe(202);
});

test("Assessment deadlines survive reconnects and reject expired written turns", async () => {
  const clock = makeClock();
  const timers = fakeTimers();
  const realtime = fakeRealtime();
  const app = makeApp({ now: clock, realtime, schedule: timers.schedule });
  const learner = await signUp(app);
  const [voice] = await testDb
    .insert(schema.assessment)
    .values({ userId: learner.id, mode: "voice", startedAt: clock() })
    .returning();
  await app.request(`/api/assessments/${voice!.id}/call`, sdp(learner.cookie));
  expect(timers.waiting()).toEqual([540_000, 600_000]);
  clock.advance({ minutes: 8 });
  await realtime.sideband().close();
  await app.request(`/api/assessments/${voice!.id}/call`, sdp(learner.cookie));
  expect(timers.waiting()).toEqual([60_000, 120_000]);
  clock.advance({ minutes: 2 });
  await timers.fire(120_000);
  expect(realtime.sideband().hungUp).toBe(true);
  expect((await app.request(`/api/assessments/${voice!.id}/call`, sdp(learner.cookie))).status).toBe(409);
  await testDb.update(schema.assessment).set({ status: "discarded" }).where(eq(schema.assessment.id, voice!.id));
  const [written] = await testDb
    .insert(schema.assessment)
    .values({ userId: learner.id, mode: "written", startedAt: new Date(clock().getTime() - 600_000) })
    .returning();
  expect(
    (
      await app.request(
        `/api/assessments/${written!.id}/chat`,
        json({ message: userMessage("Too late") }, learner.cookie),
      )
    ).status,
  ).toBe(409);
});

test("overlapping Assessment starts leave one open attempt", async () => {
  const app = makeApp();
  const learner = await signUp(app);
  const otherInstance = makeApp();
  const replies = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      (i % 2 ? app : otherInstance).request("/api/assessments", json({ mode: "written" }, learner.cookie)),
    ),
  );
  expect(replies.filter((r) => r.status === 201)).toHaveLength(1);
  expect(replies.every((r) => [200, 201, 409].includes(r.status))).toBe(true);
  expect(
    await testDb
      .select()
      .from(schema.assessment)
      .where(and(eq(schema.assessment.userId, learner.id), eq(schema.assessment.status, "in_progress"))),
  ).toHaveLength(1);
});

test("Assessment handshake time counts toward its deadline", async () => {
  const clock = makeClock();
  const timers = fakeTimers();
  const realtime = fakeRealtime();
  const create = realtime.createCall.bind(realtime);
  realtime.createCall = async (...args) => {
    clock.advance({ seconds: 30 });
    return create(...args);
  };
  const app = makeApp({ now: clock, realtime, schedule: timers.schedule });
  const learner = await signUp(app);
  const [row] = await testDb
    .insert(schema.assessment)
    .values({ userId: learner.id, mode: "voice", startedAt: clock() })
    .returning();
  expect((await app.request(`/api/assessments/${row!.id}/call`, sdp(learner.cookie))).status).toBe(201);
  expect(timers.waiting()).toEqual([510_000, 570_000]);
  await realtime.sideband().close();
});

test("cancelling a chat waits for upstream cleanup before releasing its claim", async () => {
  const learner = await signUp(makeApp());
  const [user] = await testDb.select().from(schema.user).where(eq(schema.user.id, learner.id));
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const app = new Hono<AppEnv>()
    .use("*", async (c, next) => {
      c.set("user", user!);
      await next();
    })
    .use("*", requestLimits(makeClock()))
    .post(
      "/api/roleplays/:id/chat",
      () =>
        new Response(
          new ReadableStream({
            async cancel() {
              entered.resolve();
              await release.promise;
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
  const chat = () => app.request("/api/roleplays/cancel/chat", { method: "POST" });
  const first = await chat();
  const cancelled = first.body!.cancel();
  try {
    await entered.promise;
    expect((await chat()).status).toBe(409);
  } finally {
    release.resolve();
    await cancelled;
  }
  const second = await chat();
  expect(second.status).toBe(200);
  await second.body!.cancel();
});

test("score write order survives older and identical event times", async () => {
  const learner = await signUp(makeApp());
  for (const [score, hour] of [
    [50, 8],
    [100, 10],
    [0, 9],
    [100, 9],
  ]) {
    await recordScores(
      testDb,
      learner.id,
      { grammar: score! },
      { alpha: 0.5, source: "lesson", sourceId: crypto.randomUUID(), at: new Date(Date.UTC(2026, 9, 15, hour!)) },
    );
  }
  expect((await skillProfile(testDb, learner.id)).grammar?.score).toBe(69);
});

test("fillGap leakage checks match whole answers, not letters inside other words", () => {
  expect(questionProblem({ ...question, prompt: "This ___ my book.", answer: "is" })).toBeUndefined();
  expect(questionProblem({ ...question, prompt: "What ___ you doing?", answer: "at" })).toBeUndefined();
  expect(questionProblem({ ...question, prompt: "She goes ___ home." })).toBe("answer is in the prompt");
  expect(questionProblem({ ...question, prompt: "Use go(es) ___", answer: "go(es)" })).toBe("answer is in the prompt");
});

test("paged analysis closes demonstrated Focus Items once, ignoring foreign and unknown ids", async () => {
  const learner = await signUp(makeApp());
  const other = await signUp(makeApp());
  const [own, foreign] = await testDb
    .insert(schema.focusItem)
    .values(
      [learner.id, other.id].map((userId) => ({
        userId,
        label: "Subject agreement",
        kind: "grammar" as const,
        source: "assessment" as const,
        sourceId: "baseline",
        createdAt: new Date(),
      })),
    )
    .returning();
  const output = {
    summary: "You used agreement correctly.",
    focusItems: null,
    usedFocusItemIds: [own!.id, own!.id, foreign!.id, "unknown"],
  };
  const model = mockModel(output, output, output);
  const ctx = {
    db: testDb,
    now: makeClock(),
    models: { step: model, judge: model, brief: model, report: model, roadmap: model },
  };
  for (let i = 0; i < 3; i++) {
    const row = await paged(learner.id, { status: "completed", completedAt: new Date() });
    await analyseLesson(ctx, row.id);
    await analyseLesson(ctx, row.id);
  }
  const [closed] = await testDb.select().from(schema.focusItem).where(eq(schema.focusItem.id, own!.id));
  const [untouched] = await testDb.select().from(schema.focusItem).where(eq(schema.focusItem.id, foreign!.id));
  expect(closed).toMatchObject({ hits: 3, status: "closed" });
  expect(untouched).toMatchObject({ hits: 0, status: "open" });
  expect(model.doGenerateCalls).toHaveLength(3);
});

test("paid request rate limits reset and leave status reads available", async () => {
  const clock = makeClock();
  const app = makeApp({ now: clock });
  const learner = await signUp(app);
  expect(
    (await app.request("/api/roleplays/%E0/chat", json({ message: userMessage("Bad id") }, learner.cookie))).status,
  ).toBe(400);
  for (let i = 0; i < PAID_REQUESTS_PER_MINUTE; i++)
    expect((await app.request("/api/goals/missing/confirm", json({}, learner.cookie))).status).toBe(404);
  const limited = await app.request("/api/goals/missing/confirm", json({}, learner.cookie));
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("60");
  expect((await app.request("/api/me", get(learner.cookie))).status).toBe(200);
  clock.advance({ minutes: 1 });
  expect((await app.request("/api/goals/missing/confirm", json({}, learner.cookie))).status).toBe(404);
});

test("paid concurrency slots release after provider failures", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let calls = 0;
  const app = makeApp({
    speech: {
      speak: async () => {
        if (++calls === PAID_REQUESTS_IN_FLIGHT) entered.resolve();
        await release.promise;
        throw new Error("synthetic provider failure");
      },
    },
  });
  const learner = await signUp(app);
  const speak = () => app.request(`/api/pronunciation?text=${crypto.randomUUID()}`, get(learner.cookie));
  const pending = Array.from({ length: PAID_REQUESTS_IN_FLIGHT }, speak);
  try {
    await entered.promise;
    expect((await speak()).status).toBe(429);
  } finally {
    release.resolve();
    expect((await Promise.all(pending)).every((r) => r.status === 502)).toBe(true);
  }
  expect((await speak()).status).toBe(502);
  expect(calls).toBe(PAID_REQUESTS_IN_FLIGHT + 1);
});
