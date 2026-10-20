import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { and, eq } from "drizzle-orm";
import { learnerWithRoadmap } from "./fixtures";
import { fakeRealtime, fakeTimers, get, json, makeApp, makeClock, signUp, WEB_ORIGIN, type TestApp } from "./helpers";
import { testDb } from "./setup";

const offer = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n";
const sdp = (cookie: string) => ({
  method: "POST",
  headers: { "content-type": "application/sdp", origin: WEB_ORIGIN, cookie },
  body: offer,
});

function setup(clock = makeClock()) {
  const realtime = fakeRealtime();
  const timers = fakeTimers();
  const app = makeApp({ now: clock, realtime, schedule: timers.schedule });
  return { app, clock, realtime, timers };
}

const minutesOf = async (app: TestApp, cookie: string) =>
  (await (await app.request("/api/voice-minutes", get(cookie))).json()) as any;

async function callRoleplay(app: TestApp, cookie: string) {
  const [goal] = (await (await app.request("/api/goals", get(cookie))).json()) as any[];
  const roleplay = (await (await app.request("/api/roleplays", json({ goalId: goal.id }, cookie))).json()) as any;
  return app.request(`/api/roleplays/${roleplay.id}/call`, sdp(cookie));
}

describe("monthly Realtime voice cap", () => {
  test("a Learner starts the month with 10 minutes, and a Roleplay call uses them up", async () => {
    const { app, clock, realtime } = setup();
    const { cookie } = await learnerWithRoadmap(clock);
    expect(await minutesOf(app, cookie)).toEqual({
      limitMinutes: 10,
      usedSeconds: 0,
      remainingSeconds: 600,
      resetsAt: "2026-11-01T00:00:00.000Z",
      callEndsAt: null,
    });

    expect((await callRoleplay(app, cookie)).status).toBe(201);
    clock.advance({ minutes: 2 });
    // A live call counts as it goes.
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 120, remainingSeconds: 480 });

    clock.advance({ minutes: 3 });
    await realtime.sideband().close();
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 300, remainingSeconds: 300 });
  });

  test("the agent is nudged to wrap up 60 seconds before the budget runs out, then the call is hung up", async () => {
    const { app, clock, realtime, timers } = setup();
    const { cookie, id } = await learnerWithRoadmap(clock);

    await callRoleplay(app, cookie);
    expect(timers.waiting()).toEqual([540_000, 600_000]);
    const sb = realtime.sideband();

    clock.advance({ minutes: 9 });
    await timers.fire(540_000);
    const nudge = sb.sent.at(-1);
    expect(nudge).toMatchObject({ type: "session.update" });
    expect(nudge.session.instructions).toContain("wrap up");
    expect(sb.hungUp).toBe(false);

    clock.advance({ minutes: 1 });
    await timers.fire(600_000);
    expect(sb.hungUp).toBe(true);
    const [usage] = await testDb
      .select()
      .from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.userId, id), eq(schema.aiUsage.kind, "realtime")));
    expect(usage!.seconds).toBe(600);
    expect(await minutesOf(app, cookie)).toMatchObject({ remainingSeconds: 0 });
  });

  test("a call that ends early cancels its wrap-up and hangup timers", async () => {
    const { app, clock, realtime, timers } = setup();
    const { cookie } = await learnerWithRoadmap(clock);
    await callRoleplay(app, cookie);

    clock.advance({ minutes: 1 });
    await realtime.sideband().close();
    expect(timers.waiting()).toEqual([]);
  });

  test("a later call only gets what's left of the month's budget", async () => {
    const { app, clock, realtime, timers } = setup();
    const { cookie } = await learnerWithRoadmap(clock);
    await callRoleplay(app, cookie);
    clock.advance({ minutes: 5 });
    await realtime.sideband().close();

    await callRoleplay(app, cookie);
    expect(timers.waiting()).toEqual([240_000, 300_000]);
  });

  test("starting a Roleplay call with no minutes left is refused", async () => {
    const { app, clock, timers } = setup();
    const { cookie } = await learnerWithRoadmap(clock);
    await callRoleplay(app, cookie);
    clock.advance({ minutes: 10 });
    await timers.fire(600_000);

    const res = await callRoleplay(app, cookie);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ remainingSeconds: 0 });
  });

  test("Voice Assessments consume the shared allowance and have budget timers", async () => {
    const { app, clock, realtime, timers } = setup();
    const { cookie } = await signUp(app);
    const { id } = (await (await app.request("/api/assessments", json({ mode: "voice" }, cookie))).json()) as any;
    expect((await app.request(`/api/assessments/${id}/call`, sdp(cookie))).status).toBe(201);
    expect(timers.waiting()).toEqual([540_000, 600_000]);

    clock.advance({ minutes: 9 });
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 540, remainingSeconds: 60 });
    await realtime.sideband().close();
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 540, remainingSeconds: 60 });
  });

  test("Roleplay usage limits Assessment calls too, including retries at exhaustion", async () => {
    const { app, clock, realtime, timers } = setup();
    const { cookie, id: userId } = await learnerWithRoadmap(clock);
    await callRoleplay(app, cookie);
    clock.advance({ minutes: 8 });
    await realtime.sideband().close();
    const [assessment] = await testDb
      .insert(schema.assessment)
      .values({ userId, mode: "voice", startedAt: clock() })
      .returning();
    expect((await app.request(`/api/assessments/${assessment!.id}/call`, sdp(cookie))).status).toBe(201);
    expect(timers.waiting()).toEqual([60_000, 120_000]);
    clock.advance({ minutes: 2 });
    await timers.fire(120_000);
    for (let i = 0; i < 2; i++) {
      const response = await app.request(`/api/assessments/${assessment!.id}/call`, sdp(cookie));
      expect(response.status).toBe(429);
      expect(await response.json()).toMatchObject({ remainingSeconds: 0, resetsAt: "2026-11-01T00:00:00.000Z" });
    }
    expect(realtime.calls).toHaveLength(2);
  });

  test("a Voice Assessment call only gets what's left of its ten minutes, and none once they are gone", async () => {
    const { app, clock, timers } = setup();
    const { cookie } = await signUp(app);
    const { id } = (await (await app.request("/api/assessments", json({ mode: "voice" }, cookie))).json()) as any;
    clock.advance({ minutes: 4 });
    expect((await app.request(`/api/assessments/${id}/call`, sdp(cookie))).status).toBe(201);
    expect(timers.waiting()).toEqual([300_000, 360_000]);
  });

  test("a Voice Assessment refuses a call once its ten minutes are up", async () => {
    const { app, clock, realtime } = setup();
    const { cookie } = await signUp(app);
    const { id } = (await (await app.request("/api/assessments", json({ mode: "voice" }, cookie))).json()) as any;
    clock.advance({ minutes: 11 });
    expect((await app.request(`/api/assessments/${id}/call`, sdp(cookie))).status).toBe(409);
    expect(realtime.calls).toHaveLength(0);
  });

  test("a Written Assessment refuses chat once its ten minutes are up", async () => {
    const { app, clock } = setup();
    const { cookie } = await signUp(app);
    const { id } = (await (await app.request("/api/assessments", json({ mode: "written" }, cookie))).json()) as any;
    clock.advance({ minutes: 11 });
    const res = await app.request(
      `/api/assessments/${id}/chat`,
      json({ message: { id: "m1", role: "user", parts: [{ type: "text", text: "Hi" }] } }, cookie),
    );
    expect(res.status).toBe(409);
  });

  test("usage persists across UTC days and local midnight; renewal is UTC month start", async () => {
    const clock = makeClock("2026-10-31T17:30:00Z");
    const { app, realtime } = setup(clock);
    const { cookie } = await learnerWithRoadmap(clock, { timezone: "Asia/Kolkata" });
    await callRoleplay(app, cookie);
    clock.advance({ minutes: 10 });
    await realtime.sideband().close();
    clock.set("2026-10-31T18:30:00Z");
    expect(await minutesOf(app, cookie)).toMatchObject({ remainingSeconds: 0 });
    clock.set("2026-10-31T23:59:59Z");
    expect(await minutesOf(app, cookie)).toMatchObject({ remainingSeconds: 0 });
    clock.set("2026-11-01T00:00:00Z");
    expect(await minutesOf(app, cookie)).toMatchObject({
      usedSeconds: 0,
      remainingSeconds: 600,
      resetsAt: "2026-12-01T00:00:00.000Z",
    });
    expect((await callRoleplay(app, cookie)).status).toBe(201);
  });

  test("live and closed cross-year calls count only seconds inside the current month", async () => {
    const clock = makeClock("2026-12-31T23:58:00Z");
    const { app, realtime, timers } = setup(clock);
    const { cookie } = await learnerWithRoadmap(clock);
    clock.set("2026-12-31T23:58:00Z");
    await callRoleplay(app, cookie);
    clock.advance({ minutes: 3 });
    expect(await minutesOf(app, cookie)).toMatchObject({
      usedSeconds: 60,
      remainingSeconds: 540,
      resetsAt: "2027-02-01T00:00:00.000Z",
      callEndsAt: "2027-01-01T00:08:00.000Z",
    });
    await realtime.sideband().close();
    expect(timers.waiting()).toEqual([]);
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 60, remainingSeconds: 540, callEndsAt: null });
  });

  test("existing usage counts immediately, excludes recordings and isolates accounts", async () => {
    const { app, clock } = setup();
    const { cookie, id } = await signUp(app);
    const other = await signUp(app);
    await testDb.insert(schema.aiUsage).values([
      {
        userId: id,
        kind: "realtime",
        startedAt: new Date("2026-10-01T00:00:00Z"),
        seconds: 120,
        usage: { purpose: "assessment" },
      },
      {
        userId: id,
        kind: "realtime",
        startedAt: new Date("2026-10-02T00:00:00Z"),
        seconds: 180,
        usage: { purpose: "roleplay" },
      },
      { userId: id, kind: "recording", startedAt: clock(), seconds: 600 },
      { userId: id, kind: "realtime", startedAt: new Date("2026-09-30T23:59:00Z"), seconds: 120 },
    ]);
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 360, remainingSeconds: 240 });
    expect(await minutesOf(app, other.cookie)).toMatchObject({ usedSeconds: 0, remainingSeconds: 600 });
    await testDb.update(schema.user).set({ timezone: "Pacific/Kiritimati" }).where(eq(schema.user.id, id));
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 360, remainingSeconds: 240 });
  });

  test("concurrent starts share one slot and a failed provider call releases it without charging", async () => {
    const clock = makeClock();
    const realtime = fakeRealtime();
    const gate = Promise.withResolvers<void>();
    const connecting = Promise.withResolvers<void>();
    let fail = true;
    const app = makeApp({
      now: clock,
      realtime: {
        ...realtime,
        createCall: async (...args) => {
          if (fail) {
            connecting.resolve();
            await gate.promise;
            throw new Error("provider unavailable");
          }
          return realtime.createCall(...args);
        },
      },
    });
    const { cookie } = await signUp(app);
    const { id } = (await (await app.request("/api/assessments", json({ mode: "voice" }, cookie))).json()) as any;
    const first = app.request(`/api/assessments/${id}/call`, sdp(cookie));
    await connecting.promise;
    expect((await app.request(`/api/assessments/${id}/call`, sdp(cookie))).status).toBe(409);
    gate.resolve();
    expect((await first).status).toBe(500);
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 0, remainingSeconds: 600 });
    fail = false;
    expect((await app.request(`/api/assessments/${id}/call`, sdp(cookie))).status).toBe(201);
  });

  test("fractional elapsed seconds never grant an extra second of credit", async () => {
    const { app, clock } = setup();
    const { cookie, id } = await signUp(app);
    await testDb
      .insert(schema.aiUsage)
      .values({ userId: id, kind: "realtime", startedAt: new Date(clock().getTime() - 600_000), seconds: 599.5 });
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 600, remainingSeconds: 0 });
  });
});
