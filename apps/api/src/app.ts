import { schema, type Db } from "@impromptu/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { assessments } from "./assessments";
import { goals } from "./goals";
import type { Mailer } from "./mailer";
import type { Models } from "./models";
import { skillHistory, skillProfile } from "./scoring";

export type { Mailer, Models };

// DateTimeFormat throws on unknown zones and, unlike supportedValuesOf, accepts aliases like Asia/Kolkata.
const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
});

export type Env = {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  WEB_ORIGIN: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // Parent domain shared by web and API in production, e.g. impromptu.app
  COOKIE_DOMAIN?: string;
};

export const defaultSettings = {
  // Moving-average weight of a new result: new = old + α × (result − old).
  alphaAssessment: 0.5,
  alphaLesson: 0.15,
};
export type Settings = typeof defaultSettings;

export type Deps = { db: Db; now: () => Date; env: Env; models: Models; mailer: Mailer; settings?: Partial<Settings> };

export type User = typeof schema.user.$inferSelect;
export type AppEnv = { Variables: { user: User } };

export function createApp(deps: Deps) {
  const { db, env } = deps;
  const settings = { ...defaultSettings, ...deps.settings };
  const auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
    socialProviders: env.GOOGLE_CLIENT_ID
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
      : {},
    advanced: env.COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } } : {},
    user: {
      deleteUser: { enabled: true },
      additionalFields: { timezone: { type: "string", required: false, defaultValue: "UTC", validator: { input: timezone } } },
    },
  });

  return (
    new Hono<AppEnv>()
      .use("/api/*", cors({ origin: env.WEB_ORIGIN, credentials: true }))
      .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
      // Registered after the auth handler, so it guards every other /api route.
      .use("/api/*", async (c, next) => {
        const session = await auth.api.getSession({ headers: c.req.raw.headers });
        if (!session) return c.json({ error: "Unauthorized" }, 401);
        c.set("user", session.user as User);
        await next();
      })
      .get("/api/me", (c) => c.json(c.var.user))
      .route("/api/goals", goals(deps))
      .route("/api/assessments", assessments({ ...deps, settings }))
      .get("/api/skill-profile", async (c) => c.json(await skillProfile(db, c.var.user.id)))
      .get("/api/skill-profile/history", async (c) => c.json(await skillHistory(db, c.var.user.id)))
  );
}

export type AppType = ReturnType<typeof createApp>;
