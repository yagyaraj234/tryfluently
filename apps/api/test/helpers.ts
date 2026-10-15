import { createApp } from "../src/app";
import { testDb } from "./setup";

export const WEB_ORIGIN = "http://localhost:5173";

export function makeApp(now = () => new Date("2026-10-15T09:00:00Z")) {
  return createApp({
    db: testDb,
    now,
    env: {
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
      BETTER_AUTH_URL: "http://localhost:3000",
      WEB_ORIGIN,
    },
  });
}

export const uniqueEmail = () => `learner-${crypto.randomUUID()}@example.com`;

export const json = (body: unknown, cookie?: string) => ({
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: WEB_ORIGIN,
    ...(cookie ? { cookie } : {}),
  },
  body: JSON.stringify(body),
});

// Turns Set-Cookie headers into a Cookie header for the next request.
export const cookieFrom = (res: Response) =>
  res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
