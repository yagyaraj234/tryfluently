import type { LanguageModel } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { createApp, type Env, type Mailer, type Models, type Schedule, type Settings, type Speech, type Transcriber } from "../src/app";
import type { Realtime, RealtimeEvent, RealtimeSession } from "../src/realtime";
import { testDb } from "./setup";

export const WEB_ORIGIN = "http://localhost:5173";

type Overrides = {
  now?: () => Date;
  env?: Partial<Env>;
  models?: Partial<Models>;
  mailer?: Mailer;
  speech?: Speech;
  realtime?: Realtime;
  schedule?: Schedule;
  transcriber?: Transcriber;
  settings?: Partial<Settings>;
};

// Transcribes each recording to the next scripted text (or a default) and records what it was sent.
export function fakeTranscriber(...texts: string[]) {
  const calls: Blob[] = [];
  return {
    calls,
    transcribe: async (audio: Blob) => {
      calls.push(audio);
      return { text: texts.shift() ?? "I usually start my day with a short walk and then check my emails." };
    },
  };
}

// Returns fake audio and records what it was asked to say.
export function fakeSpeech() {
  const calls: Parameters<Speech["speak"]>[0][] = [];
  return {
    calls,
    speak: async (req: (typeof calls)[number]) => {
      calls.push(req);
      return { audio: new TextEncoder().encode(`audio:${req.voice}:${req.text}`), contentType: "audio/mpeg" };
    },
  };
}

// Stands in for OpenAI Realtime: records calls and lets a test play sideband events and close the call.
export function fakeRealtime() {
  const calls: { sdp: string; session: RealtimeSession; callId: string }[] = [];
  const sidebands = new Map<
    string,
    { sent: any[]; hungUp: boolean; emit: (e: RealtimeEvent) => void; close: () => Promise<void> }
  >();
  const realtime: Realtime = {
    async createCall(sdp, session) {
      const callId = `rtc_${calls.length + 1}`;
      calls.push({ sdp, session, callId });
      return { answer: `v=0 answer for ${callId}`, callId };
    },
    attach(callId, { onEvent, onClose }) {
      const sb = {
        sent: [] as any[],
        hungUp: false,
        emit: onEvent,
        close: async () => onClose(),
      };
      sidebands.set(callId, sb);
      return {
        send: (e: object) => void sb.sent.push(e),
        hangup: async () => {
          sb.hungUp = true;
          await onClose();
        },
      };
    },
  };
  return { ...realtime, calls, sidebands, sideband: (n = calls.length) => sidebands.get(`rtc_${n}`)! };
}

// Records emails instead of sending them.
export function fakeMailer() {
  const sent: Parameters<Mailer["send"]>[0][] = [];
  return { sent, send: async (email: (typeof sent)[number]) => void sent.push(email) };
}

// Timers that only go off when a test fires them, so time-based rules run on the injected clock.
export function fakeTimers() {
  const pending: { ms: number; fn: () => unknown; cancelled: boolean }[] = [];
  const schedule: Schedule = (ms, fn) => {
    const t = { ms, fn, cancelled: false };
    pending.push(t);
    return () => void (t.cancelled = true);
  };
  return {
    schedule,
    // Delays of the timers still waiting, in ms.
    waiting: () => pending.filter((t) => !t.cancelled).map((t) => t.ms),
    // Fires the waiting timer set for `ms`.
    fire: async (ms: number) => {
      const t = pending.find((p) => !p.cancelled && p.ms === ms);
      if (!t) throw new Error(`no timer waiting for ${ms} ms`);
      t.cancelled = true;
      await t.fn();
    },
  };
}

// A model that fails loudly, so a test notices an AI call it didn't script.
const unscripted = (job: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error(`unscripted ${job} model call`);
    },
  });

export function makeApp({
  now = () => new Date("2026-10-15T09:00:00Z"),
  models = {},
  mailer = fakeMailer(),
  speech = fakeSpeech(),
  realtime = fakeRealtime(),
  transcriber = fakeTranscriber(),
  schedule = fakeTimers().schedule,
  settings,
  env,
}: Overrides = {}) {
  return createApp({
    db: testDb,
    now,
    mailer,
    speech,
    realtime,
    transcriber,
    schedule,
    settings,
    models: {
      step: unscripted("step"),
      brief: unscripted("brief"),
      roadmap: unscripted("roadmap"),
      judge: unscripted("judge"),
      report: unscripted("report"),
      ...models,
    },
    env: {
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
      WEB_ORIGIN,
      ...env,
    },
  });
}

export type TestApp = ReturnType<typeof makeApp>;

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 80, text: 80, reasoning: 0 },
};

// Scripts a model that answers each call with the next reply in order; objects are sent as JSON text.
export function mockModel(...replies: unknown[]): LanguageModel & MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: replies.map((r) => ({
      content: [{ type: "text" as const, text: typeof r === "string" ? r : JSON.stringify(r) }],
      finishReason: { unified: "stop" as const, raw: "stop" },
      usage,
      warnings: [],
      response: { id: `resp-${crypto.randomUUID()}` },
    })),
  });
}

// Scripts a chat model that streams each reply in order, one per call.
export function mockChat(...replies: string[]): LanguageModel & MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: replies.map((text) => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start" as const, warnings: [] },
        { type: "response-metadata" as const, id: `resp-${crypto.randomUUID()}` },
        { type: "text-start" as const, id: "t" },
        { type: "text-delta" as const, id: "t", delta: text },
        { type: "text-end" as const, id: "t" },
        { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage },
      ]),
    })),
  });
}

export type Turn = (string | { tool: string; input: object })[];

// Scripts a chat model turn by turn; each turn streams text and/or tool calls.
export function mockTurns(...turns: Turn[]): LanguageModel & MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doStream: turns.map((parts) => ({
      stream: convertArrayToReadableStream([
        { type: "stream-start" as const, warnings: [] },
        { type: "response-metadata" as const, id: `resp-${crypto.randomUUID()}` },
        ...parts.flatMap((p, i): any[] =>
          typeof p === "string"
            ? [
                { type: "text-start" as const, id: `t${i}` },
                { type: "text-delta" as const, id: `t${i}`, delta: p },
                { type: "text-end" as const, id: `t${i}` },
              ]
            : [{ type: "tool-call" as const, toolCallId: `call-${crypto.randomUUID()}`, toolName: p.tool, input: JSON.stringify(p.input) }],
        ),
        {
          type: "finish" as const,
          finishReason: { unified: parts.some((p) => typeof p !== "string") ? ("tool-calls" as const) : ("stop" as const), raw: "x" },
          usage,
        },
      ]),
    })),
  });
}

// A clock tests can move forward, passed in as the app's `now`.
export function makeClock(start = "2026-10-15T09:00:00Z") {
  let t = new Date(start).getTime();
  const now = () => new Date(t);
  now.advance = ({ days = 0, minutes = 0, seconds = 0 }) => {
    t += (days * 86_400 + minutes * 60 + seconds) * 1000;
  };
  now.set = (iso: string) => {
    t = new Date(iso).getTime();
  };
  return now;
}

export const userMessage = (text: string) => ({ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] });

export const uniqueEmail = () => `learner-${crypto.randomUUID()}@example.com`;

export const json = (body: unknown, cookie?: string, method = "POST") => ({
  method,
  headers: {
    "content-type": "application/json",
    origin: WEB_ORIGIN,
    ...(cookie ? { cookie } : {}),
  },
  body: JSON.stringify(body),
});

export const get = (cookie: string) => ({ headers: { cookie } });
export const del = (cookie: string) => ({ method: "DELETE", headers: { cookie, origin: WEB_ORIGIN } });

// Turns Set-Cookie headers into a Cookie header for the next request.
export const cookieFrom = (res: Response) =>
  res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

// Signs up a fresh Learner and returns their session cookie and id.
export async function signUp(app: TestApp, extra: Record<string, unknown> = {}) {
  const res = await app.request(
    "/api/auth/sign-up/email",
    json({ name: "Asha", email: uniqueEmail(), password: "correct-horse-battery", ...extra }),
  );
  const cookie = cookieFrom(res);
  const { id } = (await (await app.request("/api/me", get(cookie))).json()) as { id: string };
  return { cookie, id };
}
