import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { realtimeBroker } from "../src/realtime";
import { fakeRealtime, fakeTimers, makeApp, makeClock, signUp } from "./helpers";
import { testDb } from "./setup";

async function setup() {
  const { id: userId } = await signUp(makeApp());
  const realtime = fakeRealtime();
  const timers = fakeTimers();
  const clock = makeClock();
  const broker = realtimeBroker({
    limitMinutes: 10,
    db: testDb,
    now: clock,
    realtime,
    schedule: timers.schedule,
  });
  return { userId, realtime, timers, clock, broker };
}

const opts = (onTranscript: (t: UIMessage[]) => Promise<unknown>) => ({
  sdp: "v=0",
  instructions: "Speak English",
  purpose: "roleplay" as const,
  onTranscript,
});
const utterance = (id: string) => ({
  type: "conversation.item.input_audio_transcription.completed",
  item_id: id,
  transcript: id,
});

describe("Realtime close failures", () => {
  test("a sideband disconnect hangs up the provider before releasing the call or writing usage", async () => {
    const { userId, realtime, broker, clock } = await setup();
    const attach = realtime.attach;
    const requested = Promise.withResolvers<void>();
    const terminated = Promise.withResolvers<void>();
    let requests = 0;
    realtime.attach = (...args) => {
      const sideband = attach(...args);
      return {
        ...sideband,
        hangup: async () => {
          requests++;
          requested.resolve();
          await terminated.promise;
          await sideband.hangup();
        },
      };
    };
    await broker.start(
      userId,
      opts(async () => {}),
    );
    clock.advance({ seconds: 10 });
    const closing = realtime.sideband().close();
    await requested.promise;
    const ending = broker.hangup(userId);
    clock.advance({ seconds: 5 });
    expect(
      await broker.start(
        userId,
        opts(async () => {}),
      ),
    ).toEqual({ busy: true });
    expect((await broker.voiceMinutes(userId)).usedSeconds).toBe(15);
    expect(await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId))).toHaveLength(0);
    terminated.resolve();
    await Promise.all([closing, ending]);
    expect(requests).toBe(1);
    expect(realtime.sideband().hungUp).toBe(true);
    const rows = await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.seconds).toBe(15);
    expect((await broker.voiceMinutes(userId)).callEndsAt).toBeNull();
  });

  test("failed disconnect cleanup retains the slot and allowance until its scheduled retry succeeds", async () => {
    const { userId, realtime, broker, timers, clock } = await setup();
    const attach = realtime.attach;
    let requests = 0;
    realtime.attach = (...args) => {
      const sideband = attach(...args);
      return {
        ...sideband,
        hangup: async () => {
          if (++requests === 1) throw new Error("provider unavailable");
          await sideband.hangup();
        },
      };
    };
    await broker.start(
      userId,
      opts(async () => {}),
    );
    clock.advance({ seconds: 10 });
    await expect(realtime.sideband().close()).rejects.toThrow("provider unavailable");
    expect(
      await broker.start(
        userId,
        opts(async () => {}),
      ),
    ).toEqual({ busy: true });
    expect(timers.waiting()).toContain(1_000);
    expect(await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId))).toHaveLength(0);
    clock.advance({ seconds: 5 });
    await timers.fire(1_000);
    expect(requests).toBe(2);
    expect(realtime.sideband().hungUp).toBe(true);
    expect(timers.waiting()).toEqual([]);
    expect((await broker.voiceMinutes(userId)).usedSeconds).toBe(15);
    await realtime.sideband().close();
    expect(requests).toBe(2);
    expect(await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId))).toHaveLength(1);
  });

  test.each([120, 900, undefined])(
    "slow setup preserves the earlier attempt or monthly deadline (%s)",
    async (budgetSeconds) => {
      const { userId } = await setup();
      const clock = makeClock();
      const realtime = fakeRealtime();
      const timers = fakeTimers();
      const broker = realtimeBroker({
        limitMinutes: 10,
        db: testDb,
        now: clock,
        schedule: timers.schedule,
        realtime: {
          ...realtime,
          createCall: async (...args) => {
            clock.advance({ seconds: 30 });
            return realtime.createCall(...args);
          },
        },
      });
      await broker.start(userId, { ...opts(async () => {}), budgetSeconds });
      const remaining = Math.min(600, (budgetSeconds ?? Infinity) - 30);
      expect(timers.waiting()).toEqual([(remaining - 60) * 1000, remaining * 1000]);
      expect((await broker.voiceMinutes(userId)).callEndsAt).toBe(
        new Date(clock().getTime() + remaining * 1000).toISOString(),
      );
      await timers.fire(remaining * 1000);
      expect(realtime.sideband().hungUp).toBe(true);
    },
  );
  test("hangup requested during the SDP handshake waits for the call, then closes it", async () => {
    const { userId } = await setup();
    const realtime = fakeRealtime();
    const connected = Promise.withResolvers<void>();
    const broker = realtimeBroker({
      limitMinutes: 10,
      db: testDb,
      now: makeClock(),
      schedule: fakeTimers().schedule,
      realtime: {
        ...realtime,
        createCall: async (...args) => {
          await connected.promise;
          return realtime.createCall(...args);
        },
      },
    });
    const start = broker.start(userId, { ...opts(async () => {}), targetId: "roleplay" });
    const ending = broker.hangup(userId, "roleplay");
    connected.resolve();
    await Promise.all([start, ending]);
    expect(realtime.sideband().hungUp).toBe(true);
  });
  test("ending another Assessment or Roleplay cannot hang up the current call", async () => {
    const { userId, realtime, broker } = await setup();
    await broker.start(userId, { ...opts(async () => {}), targetId: "current-roleplay" });
    await broker.hangup(userId, "earlier-assessment");
    expect(realtime.sideband().hungUp).toBe(false);
    await broker.hangup(userId, "current-roleplay");
    expect(realtime.sideband().hungUp).toBe(true);
  });
  test("an end-call tool waits for the closing audio, then hangs up", async () => {
    const { userId, realtime, broker } = await setup();
    await broker.start(userId, { ...opts(async () => {}), endTool: "end_call" });
    const sideband = realtime.sideband();
    await sideband.emit({ type: "response.function_call_arguments.done", name: "end_call", response_id: "response_1" });
    expect(sideband.hungUp).toBe(false);
    await sideband.emit({ type: "output_audio_buffer.stopped", response_id: "response_1" });
    expect(sideband.hungUp).toBe(true);
  });
  test("an end-call tool falls back when the closing audio event is missing", async () => {
    const { userId, realtime, timers, broker } = await setup();
    await broker.start(userId, { ...opts(async () => {}), endTool: "end_call" });
    await realtime
      .sideband()
      .emit({ type: "response.function_call_arguments.done", name: "end_call", response_id: "response_1" });
    await timers.fire(5_000);
    expect(realtime.sideband().hungUp).toBe(true);
  });
  test("a failed transcript save propagates from hangup, still logs usage and releases the call", async () => {
    const { userId, realtime, timers, broker } = await setup();
    const error = new Error("transcript unavailable");
    const options = opts(async () => {
      throw error;
    });
    await broker.start(userId, options);
    realtime.sideband().emit(utterance("first"));
    await expect(broker.hangup(userId)).rejects.toBe(error);
    expect(timers.waiting()).toEqual([]);
    expect(await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId))).toHaveLength(1);
    expect(await broker.start(userId, options)).toHaveProperty("answer");
    await broker.hangup(userId);
  });

  test("one rejected save doesn't poison later full-transcript saves", async () => {
    const { userId, realtime, broker } = await setup();
    let calls = 0;
    let saved: UIMessage[] = [];
    await broker.start(
      userId,
      opts(async (transcript) => {
        if (++calls === 1) throw new Error("temporary save failure");
        saved = transcript;
      }),
    );
    realtime.sideband().emit(utterance("first"));
    realtime.sideband().emit(utterance("second"));
    await broker.hangup(userId);
    expect(calls).toBe(2);
    expect(saved.map((m) => m.id)).toEqual(["first", "second"]);
  });

  test("a rejected usage write settles hangup, cancels timers and releases the call", async () => {
    const { realtime, timers, broker } = await setup();
    // Missing Learner forces a real foreign-key failure on ai_usage.
    const missingId = crypto.randomUUID();
    const options = opts(async () => {});
    await broker.start(missingId, options);
    await expect(broker.hangup(missingId)).rejects.toThrow();
    expect(timers.waiting()).toEqual([]);
    expect(await broker.start(missingId, options)).toHaveProperty("answer");
    await expect(realtime.sideband().close()).rejects.toThrow();
  });

  test("duplicate close waits for pending saves and writes usage once", async () => {
    const { userId, realtime, broker } = await setup();
    const gate = Promise.withResolvers<void>();
    await broker.start(
      userId,
      opts(async () => gate.promise),
    );
    realtime.sideband().emit(utterance("first"));
    const first = realtime.sideband().close();
    let finished = false;
    const second = realtime
      .sideband()
      .close()
      .then(() => {
        finished = true;
      });
    await Promise.resolve();
    expect(finished).toBe(false);
    gate.resolve();
    await Promise.all([first, second]);
    expect(await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, userId))).toHaveLength(1);
  });
});
