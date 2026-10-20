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

describe("daily Realtime voice cap", () => {
  test("a Learner starts the day with 15 minutes, and a Roleplay call uses them up", async () => {
    const { app, clock, realtime } = setup();
    const { cookie } = await learnerWithRoadmap(clock);
    expect(await minutesOf(app, cookie)).toEqual({ limitMinutes: 15, usedSeconds: 0, remainingSeconds: 900 });

    expect((await callRoleplay(app, cookie)).status).toBe(201);
    clock.advance({ minutes: 2 });
    // A live call counts as it goes.
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 120, remainingSeconds: 780 });

    clock.advance({ minutes: 3 });
    await realtime.sideband().close();
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 300, remainingSeconds: 600 });
  });

  test("the agent is nudged to wrap up 60 seconds before the budget runs out, then the call is hung up", async () => {
    const { app, clock, realtime, timers } = setup();
    const { cookie, id } = await learnerWithRoadmap(clock);

    await callRoleplay(app, cookie);
    expect(timers.waiting()).toEqual([840_000, 900_000]);
    const sb = realtime.sideband();

    clock.advance({ minutes: 14 });
    await timers.fire(840_000);
    const nudge = sb.sent.at(-1);
    expect(nudge).toMatchObject({ type: "session.update" });
    expect(nudge.session.instructions).toContain("wrap up");
    expect(sb.hungUp).toBe(false);

    clock.advance({ minutes: 1 });
    await timers.fire(900_000);
    expect(sb.hungUp).toBe(true);
    const [usage] = await testDb
      .select()
      .from(schema.aiUsage)
      .where(and(eq(schema.aiUsage.userId, id), eq(schema.aiUsage.kind, "realtime")));
    expect(usage!.seconds).toBe(900);
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

  test("a later call only gets what's left of the day's budget", async () => {
    const { app, clock, realtime, timers } = setup();
    const { cookie } = await learnerWithRoadmap(clock);
    await callRoleplay(app, cookie);
    clock.advance({ minutes: 10 });
    await realtime.sideband().close();

    await callRoleplay(app, cookie);
    expect(timers.waiting()).toEqual([240_000, 300_000]);
  });

  test("starting a Roleplay call with no minutes left is refused", async () => {
    const { app, clock, timers } = setup();
    const { cookie } = await learnerWithRoadmap(clock);
    await callRoleplay(app, cookie);
    clock.advance({ minutes: 15 });
    await timers.fire(900_000);

    const res = await callRoleplay(app, cookie);
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ remainingSeconds: 0 });
  });

  test("Voice Assessment minutes don't count toward the cap and its call is capped at ten minutes", async () => {
    const { app, clock, realtime, timers } = setup();
    const { cookie } = await signUp(app);
    const { id } = (await (await app.request("/api/assessments", json({ mode: "voice" }, cookie))).json()) as any;
    expect((await app.request(`/api/assessments/${id}/call`, sdp(cookie))).status).toBe(201);
    // Wrap-up nudge at 9 minutes, hang-up at 10.
    expect(timers.waiting()).toEqual([540_000, 600_000]);

    clock.advance({ minutes: 9 });
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 0, remainingSeconds: 900 });
    await realtime.sideband().close();
    expect(await minutesOf(app, cookie)).toMatchObject({ usedSeconds: 0, remainingSeconds: 900 });
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

  test("the budget resets at the Learner's local midnight", async () => {
    // 23:00 in Kolkata is 17:30 UTC.
    const clock = makeClock("2026-10-15T17:30:00Z");
    const { app, realtime } = setup(clock);
    const { cookie } = await learnerWithRoadmap(clock, { timezone: "Asia/Kolkata" });
    await callRoleplay(app, cookie);
    clock.advance({ minutes: 10 });
    await realtime.sideband().close();
    expect(await minutesOf(app, cookie)).toMatchObject({ remainingSeconds: 300 });

    clock.set("2026-10-15T18:29:00Z"); // 23:59 local
    expect(await minutesOf(app, cookie)).toMatchObject({ remainingSeconds: 300 });
    clock.set("2026-10-15T18:30:00Z"); // 00:00 local, a new day
    expect(await minutesOf(app, cookie)).toMatchObject({ remainingSeconds: 900 });
  });
});
