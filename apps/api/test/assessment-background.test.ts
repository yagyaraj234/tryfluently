import { expect, test } from "bun:test";
import { reportReply } from "./fixtures";
import { get, json, makeApp, makeClock, mockChat, mockModel, signUp, userMessage } from "./helpers";

test("Assessment /end returns its saved Report without waiting for email delivery", async () => {
  let release!: () => void;
  const delivery = new Promise<void>((resolve) => {
    release = resolve;
  });
  const clock = makeClock();
  const app = makeApp({
    now: clock,
    mailer: {
      send: async (email) => {
        if (email.subject.includes("Assessment Report")) await delivery;
      },
    },
    models: { step: mockChat("Hello!"), report: mockModel(reportReply()) },
  });
  const { cookie } = await signUp(app);
  const { id } = (await (await app.request("/api/assessments", json({ mode: "written" }, cookie))).json()) as {
    id: string;
  };
  await (await app.request(`/api/assessments/${id}/chat`, json({ message: userMessage("Hi") }, cookie))).text();
  clock.advance({ minutes: 10 });
  const ending = app.request(`/api/assessments/${id}/end`, json({}, cookie));
  try {
    let completed = false;
    for (let n = 0; n < 100; n++) {
      const saved = (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;
      if (saved.status === "completed") {
        completed = true;
        break;
      }
      await Bun.sleep(10);
    }
    expect(completed).toBe(true);
    const result = await Promise.race([ending, Bun.sleep(100).then(() => "pending")]);
    expect(result).not.toBe("pending");
    expect((result as Response).status).toBe(200);
  } finally {
    release();
    await ending;
  }
});

import { schema } from "@impromptu/db";
import type { Mailer } from "../src/app";
import { and, eq } from "drizzle-orm";
import { preparedContent, unitsReply } from "./fixtures";
import { testDb } from "./setup";

async function complete({
  roadmap = mockModel(unitsReply()),
  step = mockModel(preparedContent()),
  mailer,
}: { roadmap?: ReturnType<typeof mockModel>; step?: ReturnType<typeof mockModel>; mailer?: Mailer } = {}) {
  const clock = makeClock();
  const models = { report: mockModel(reportReply()), roadmap, step };
  const app = makeApp({ now: clock, models, mailer });
  const { cookie, id: userId } = await signUp(app);
  const goal = (await (await app.request("/api/goals", json({ kind: "general_fluency" }, cookie))).json()) as {
    id: string;
  };
  await app.request(`/api/goals/${goal.id}/confirm`, json({}, cookie));
  const { id } = (await (await app.request("/api/assessments", json({ mode: "written" }, cookie))).json()) as {
    id: string;
  };
  clock.advance({ minutes: 10 });
  const response = await app.request(`/api/assessments/${id}/end`, json({}, cookie));
  expect(response.status).toBe(200);
  return { app, cookie, userId, id, clock, models };
}

const status = async (app: ReturnType<typeof makeApp>, cookie: string) =>
  (await (await app.request("/api/assessments/preparation", get(cookie))).json()) as any;

test("Report returns with pending durable jobs; worker builds the Roadmap without preparing a Lesson and repeated /end returns the same Report", async () => {
  const { app, cookie, userId, id, models } = await complete();
  expect(await status(app, cookie)).toEqual({ status: "pending", lesson: null });
  expect(models.roadmap.doGenerateCalls).toHaveLength(0);
  const repeat = await app.request(`/api/assessments/${id}/end`, json({}, cookie));
  expect(repeat.status).toBe(200);
  const saved = (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;
  expect(((await repeat.json()) as any).report).toEqual(saved.report);
  expect(models.report.doGenerateCalls).toHaveLength(1);
  await Promise.all([app.runJobs(userId), app.runJobs(userId)]);
  expect(await status(app, cookie)).toEqual({ status: "ready", lesson: null });
  expect(models.roadmap.doGenerateCalls).toHaveLength(1);
  // The Learner starts the first Lesson from the Roadmap; nothing is written ahead.
  expect(models.step.doGenerateCalls).toHaveLength(0);
  expect(await testDb.select().from(schema.lesson).where(eq(schema.lesson.userId, userId))).toEqual([]);
  const jobs = await testDb.select().from(schema.assessmentJob).where(eq(schema.assessmentJob.assessmentId, id));
  expect(jobs.map((j) => j.status)).toEqual(["done", "done"]);
});

test("pending work survives a new app process and expired running leases are reclaimed", async () => {
  const { cookie, userId, id, clock, models } = await complete();
  await testDb
    .update(schema.assessmentJob)
    .set({ status: "running", token: "interrupted", lockedAt: clock() })
    .where(and(eq(schema.assessmentJob.assessmentId, id), eq(schema.assessmentJob.kind, "practice")));
  const restarted = makeApp({ now: clock, models });
  expect(await status(restarted, cookie)).toMatchObject({ status: "preparing" });
  clock.advance({ minutes: 3 });
  await restarted.runJobs(userId);
  expect(await status(restarted, cookie)).toMatchObject({ status: "ready" });
});

test("requeued practice work reuses the existing Units without rebuilding the Roadmap", async () => {
  const { app, cookie, userId, models } = await complete();
  await app.runJobs(userId);
  expect((await app.request("/api/assessments/preparation", json({}, cookie))).status).toBe(202);
  await app.runJobs(userId);
  expect(await status(app, cookie)).toEqual({ status: "ready", lesson: null });
  expect(models.roadmap.doGenerateCalls).toHaveLength(1);
  expect(models.step.doGenerateCalls).toHaveLength(0);
});

test("three failures expose a terminal failure; explicit retry requeues practice and preserves Report", async () => {
  const { app, cookie, userId, id, clock, models } = await complete({
    roadmap: mockModel(unitsReply(7), unitsReply(7), unitsReply(7), unitsReply()),
  });
  for (let n = 0; n < 3; n++) {
    await app.runJobs(userId);
    clock.advance({ seconds: 15 });
  }
  expect(await status(app, cookie)).toEqual({ status: "failed", lesson: null });
  const saved = (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;
  expect(saved.status).toBe("completed");
  expect(saved.report.overallLevel).toBe("B1");
  expect((await app.request("/api/assessments/preparation", json({}, cookie))).status).toBe(202);
  expect(await status(app, cookie)).toMatchObject({ status: "pending" });
  await app.runJobs(userId);
  expect(await status(app, cookie)).toMatchObject({ status: "ready" });
  expect(models.report.doGenerateCalls).toHaveLength(1);
});

test("preparation and retry are authenticated, learner-scoped, and wait for confirmed Goals", async () => {
  const { app, cookie } = await complete();
  expect((await app.request("/api/assessments/preparation")).status).toBe(401);
  const other = await signUp(app);
  expect(await status(app, other.cookie)).toEqual({ status: "not_ready", lesson: null });
  expect((await app.request("/api/assessments/preparation", json({}, other.cookie))).status).toBe(409);
  const proposed = await app.request("/api/goals", json({ kind: "job_interview" }, cookie));
  expect(proposed.status).toBe(201);
  expect(await status(app, cookie)).toMatchObject({ status: "not_ready" });
});

test("a slow Report email does not delay ready practice", async () => {
  let release!: () => void;
  const delivery = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { app, cookie, userId } = await complete({
    mailer: {
      send: async (email) => {
        if (email.subject.includes("Assessment Report")) await delivery;
      },
    },
  });
  let finished = false;
  const work = app.runJobs(userId).then(() => {
    finished = true;
  });
  try {
    let preparation;
    for (let n = 0; n < 100; n++) {
      preparation = await status(app, cookie);
      if (preparation.status === "ready") break;
      await Bun.sleep(10);
    }
    expect(preparation.status).toBe("ready");
    expect(finished).toBe(false);
  } finally {
    release();
    await work;
  }
});

test("interrupted email jobs retry the same provider idempotency key", async () => {
  const keys: string[] = [];
  const mailer: Mailer = {
    send: async (email, key) => {
      if (email.subject.includes("Assessment Report")) keys.push(key!);
    },
  };
  const { app, userId, id, clock } = await complete({ mailer });
  await app.runJobs(userId);
  await testDb
    .update(schema.assessmentJob)
    .set({ status: "running", token: "crashed-after-send", lockedAt: clock() })
    .where(and(eq(schema.assessmentJob.assessmentId, id), eq(schema.assessmentJob.kind, "report_email")));
  clock.advance({ minutes: 3 });
  await app.runJobs(userId);
  expect(keys).toEqual([`assessment-report/${id}`, `assessment-report/${id}`]);
});

test("Lesson preparation after the initial job stays pollable, and an expired preparation can be retried", async () => {
  const { app, cookie, userId, clock } = await complete();
  await app.runJobs(userId);
  const ready = { lesson: (await (await app.request("/api/lessons/next", json({}, cookie))).json()) as any };
  await testDb
    .update(schema.lesson)
    .set({ preparation: "preparing", preparationAt: clock(), preparationToken: "interrupted-next-lesson" })
    .where(eq(schema.lesson.id, ready.lesson.id));
  expect(await status(app, cookie)).toMatchObject({ status: "preparing" });
  clock.advance({ minutes: 3 });
  expect(await status(app, cookie)).toMatchObject({ status: "failed" });
  expect((await app.request("/api/assessments/preparation", json({}, cookie))).status).toBe(202);
});

test("worker claims a lesson job; existing Lessons stay on the old format", async () => {
  const { app, userId, clock } = await complete();
  const [made] = await testDb
    .insert(schema.lesson)
    .values({ userId, position: 0, kind: "roleplay", title: "Paged", objective: "Speak clearly" })
    .returning();
  expect(made).toMatchObject({ contentVersion: 1, currentPage: 0, pageStatus: null });
  await testDb
    .insert(schema.assessmentJob)
    .values({ lessonId: made!.id, userId, kind: "lesson", availableAt: clock() });
  await app.runJobs(userId);
  const [claimed] = await testDb.select().from(schema.assessmentJob).where(eq(schema.assessmentJob.lessonId, made!.id));
  // An old-format Lesson has nothing to generate, so the claimed job just finishes.
  expect(claimed).toMatchObject({ kind: "lesson", status: "done", attempts: 1, assessmentId: null });
});
