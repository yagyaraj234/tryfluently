import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import { eq } from "drizzle-orm";
import { reportReply } from "./fixtures";
import { fakeRealtime, get, json, makeApp, makeClock, mockModel, signUp, WEB_ORIGIN, type TestApp } from "./helpers";
import { testDb } from "./setup";

const offer = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n";

const sdp = (cookie: string, body = offer) => ({
  method: "POST",
  headers: { "content-type": "application/sdp", origin: WEB_ORIGIN, cookie },
  body,
});

function setup(reports: unknown[] = []) {
  const clock = makeClock();
  const realtime = fakeRealtime();
  const app = makeApp({ now: clock, realtime, models: { report: mockModel(...reports) } });
  return { app, clock, realtime };
}

async function startVoice(app: TestApp, cookie: string) {
  const res = await app.request("/api/assessments", json({ mode: "voice" }, cookie));
  return ((await res.json()) as { id: string }).id;
}

const read = async (app: TestApp, cookie: string, id: string) =>
  (await (await app.request(`/api/assessments/${id}`, get(cookie))).json()) as any;

// One Learner turn as the sideband reports it: voice-detection timing, then the transcript.
const learnerTurn = (itemId: string, startMs: number, endMs: number, transcript: string) => [
  { type: "input_audio_buffer.speech_started", item_id: itemId, audio_start_ms: startMs },
  { type: "input_audio_buffer.speech_stopped", item_id: itemId, audio_end_ms: endMs },
  { type: "conversation.item.input_audio_transcription.completed", item_id: itemId, transcript },
];
const coachTurn = (itemId: string, transcript: string) => [
  { type: "response.output_audio_transcript.done", item_id: itemId, transcript },
];

describe("voice assessment over Realtime", () => {
  test("starting the call returns only the SDP answer; the session has token limits and gets the Assessment instructions", async () => {
    const { app, realtime } = setup();
    const { cookie } = await signUp(app);
    const id = await startVoice(app, cookie);

    const res = await app.request(`/api/assessments/${id}/call`, sdp(cookie));
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/sdp");
    expect(await res.text()).toBe("v=0 answer for rtc_1");

    expect(realtime.calls[0]!.sdp).toBe(offer);
    expect(realtime.calls[0]!.session).toMatchObject({
      type: "realtime",
      model: "gpt-realtime",
      max_output_tokens: expect.any(Number),
      truncation: { type: "retention_ratio", token_limits: { post_instructions: expect.any(Number) } },
    });
    const update = realtime.sideband().sent.find((e) => e.type === "session.update");
    expect(update.session.instructions).toContain("five phases");
  });

  test("a second live call for the same Learner is refused until the first one closes", async () => {
    const { app, realtime } = setup();
    const { cookie } = await signUp(app);
    const id = await startVoice(app, cookie);
    await app.request(`/api/assessments/${id}/call`, sdp(cookie));

    expect((await app.request(`/api/assessments/${id}/call`, sdp(cookie))).status).toBe(409);
    expect(realtime.calls).toHaveLength(1);

    await realtime.sideband(1).close();
    expect((await app.request(`/api/assessments/${id}/call`, sdp(cookie))).status).toBe(201);
  });

  test("sideband transcripts and voice timing are stored on the Assessment, and no audio", async () => {
    const { app, realtime } = setup();
    const { cookie } = await signUp(app);
    const id = await startVoice(app, cookie);
    await app.request(`/api/assessments/${id}/call`, sdp(cookie));

    const sb = realtime.sideband();
    for (const e of [
      ...coachTurn("item_a", "Hi! What do you do for work?"),
      ...learnerTurn("item_b", 1200, 4800, "I am backend engineer."),
      { type: "response.output_audio.delta", delta: "UklGRiQAAABXQVZF" },
    ])
      sb.emit(e);
    await sb.close();

    expect((await read(app, cookie, id)).transcript).toEqual([
      { id: "item_a", role: "assistant", parts: [{ type: "text", text: "Hi! What do you do for work?" }] },
      {
        id: "item_b",
        role: "user",
        parts: [{ type: "text", text: "I am backend engineer." }],
        metadata: { speechStartMs: 1200, speechEndMs: 4800 },
      },
    ]);
  });

  test("closing the call writes a realtime ai_usage row with the seconds and tokens", async () => {
    const { app, clock, realtime } = setup();
    const { cookie, id: learnerId } = await signUp(app);
    const id = await startVoice(app, cookie);
    await app.request(`/api/assessments/${id}/call`, sdp(cookie));

    clock.advance({ minutes: 5 });
    const sb = realtime.sideband();
    const usage = { input_tokens: 900, output_tokens: 300, input_token_details: { cached_tokens: 600 } };
    sb.emit({ type: "response.done", response: { usage } });
    sb.emit({ type: "response.done", response: { usage } });
    await sb.close();

    const rows = await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.userId, learnerId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "realtime",
      callId: "rtc_1",
      seconds: 300,
      usage: {
        inputTokens: 1800,
        cachedInputTokens: 1200,
        outputTokens: 600,
        purpose: "assessment",
        provider: "openai",
      },
    });
  });

  test("the Report scores fluency from speaking speed, pauses and the judge's view of coherence", async () => {
    const reply = reportReply();
    const { app, clock, realtime } = setup([
      { ...reply, skills: { ...reply.skills, fluency: { score: 70, evidence: [] } } },
    ]);
    const { cookie } = await signUp(app);
    const id = await startVoice(app, cookie);
    await app.request(`/api/assessments/${id}/call`, sdp(cookie));

    const sb = realtime.sideband();
    const sixtyWords = Array(60).fill("word").join(" ");
    // 120 words in 60 s of speech (120 wpm), with one 1 s hesitation between the two stretches.
    for (const e of [...learnerTurn("u1", 0, 30_000, sixtyWords), ...learnerTurn("u2", 31_000, 61_000, sixtyWords)])
      sb.emit(e);

    clock.advance({ minutes: 10 });
    const end = await app.request(`/api/assessments/${id}/end`, json({}, cookie));
    expect(end.status).toBe(200);
    expect(sb.hungUp).toBe(true);

    // speed (120 − 60) / 100 → 60; pauses 1 − 1/61 → 98.4; coherence 70
    // 0.4 × 60 + 0.2 × 98.4 + 0.4 × 70 = 71.7 → 72
    expect(await (await app.request("/api/skill-profile", get(cookie))).json()).toMatchObject({
      fluency: { score: 72, level: "C1" },
    });
    expect((await read(app, cookie, id)).report.skills.fluency).toMatchObject({ score: 72, level: "C1" });
  });

  test("a Voice Assessment ended under 4 minutes is discarded and its call hung up", async () => {
    const { app, clock, realtime } = setup();
    const { cookie } = await signUp(app);
    const id = await startVoice(app, cookie);
    await app.request(`/api/assessments/${id}/call`, sdp(cookie));

    clock.advance({ minutes: 2 });
    expect(await (await app.request(`/api/assessments/${id}/end`, json({}, cookie))).json()).toMatchObject({
      status: "discarded",
    });
    expect(realtime.sideband().hungUp).toBe(true);
  });

  test("a call can only be started on the Learner's own Voice Assessment that's still in progress", async () => {
    const { app } = setup();
    const asha = await signUp(app);
    const ravi = await signUp(app);
    const voice = await startVoice(app, asha.cookie);
    const written = (
      (await (await app.request("/api/assessments", json({ mode: "written" }, ravi.cookie))).json()) as any
    ).id;

    expect((await app.request(`/api/assessments/${voice}/call`, sdp(ravi.cookie))).status).toBe(404);
    expect((await app.request(`/api/assessments/${written}/call`, sdp(ravi.cookie))).status).toBe(409);
    expect((await app.request(`/api/assessments/${voice}/call`, sdp(asha.cookie, ""))).status).toBe(400);
  });
});

describe("resuming a dropped voice call (ADR 0005)", () => {
  const resume = (id: string, after: string) => `/api/assessments/${id}/call?after=${after}`;

  test("the browser's retry ends the old call and starts one that avoids the provider it dropped from, in the same voice", async () => {
    const { app, realtime } = setup();
    const { cookie } = await signUp(app);
    const id = await startVoice(app, cookie);
    await app.request(`/api/assessments/${id}/call`, sdp(cookie));

    const res = await app.request(resume(id, "openai"), sdp(cookie));
    expect(res.status).toBe(201);
    expect(realtime.sideband(1).hungUp).toBe(true);
    expect(realtime.calls.map((c) => c.avoid)).toEqual([undefined, "openai"]);
    expect(realtime.calls.map((c) => c.voiceKey)).toEqual([id, id]);
  });

  test("a call the coach ended can't be resumed", async () => {
    const { app, realtime } = setup();
    const { cookie } = await signUp(app);
    const id = await startVoice(app, cookie);
    await app.request(`/api/assessments/${id}/call`, sdp(cookie));
    const sb = realtime.sideband();
    await sb.emit({ type: "response.function_call_arguments.done", name: "end_call", response_id: "r1" });
    await sb.emit({ type: "output_audio_buffer.stopped", response_id: "r1" });

    const res = await app.request(resume(id, "openai"), sdp(cookie));
    expect(res.status).toBe(409);
    expect(realtime.calls).toHaveLength(1);
  });

  test("an unknown provider is refused", async () => {
    const { app } = setup();
    const { cookie } = await signUp(app);
    const id = await startVoice(app, cookie);
    expect((await app.request(resume(id, "elsewhere"), sdp(cookie))).status).toBe(400);
  });
});
