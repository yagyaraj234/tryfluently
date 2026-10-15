import type { LanguageModel } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { createApp, type Mailer, type Models } from "../src/app";
import { testDb } from "./setup";

export const WEB_ORIGIN = "http://localhost:5173";

type Overrides = { now?: () => Date; models?: Partial<Models>; mailer?: Mailer };

// Records emails instead of sending them.
export function fakeMailer() {
  const sent: Parameters<Mailer["send"]>[0][] = [];
  return { sent, send: async (email: (typeof sent)[number]) => void sent.push(email) };
}

// A model that fails loudly, so a test notices an AI call it didn't script.
const unscripted = (job: string) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error(`unscripted ${job} model call`);
    },
  });

export function makeApp({ now = () => new Date("2026-10-15T09:00:00Z"), models = {}, mailer = fakeMailer() }: Overrides = {}) {
  return createApp({
    db: testDb,
    now,
    mailer,
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
