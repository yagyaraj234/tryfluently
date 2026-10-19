import { schema, type Db } from "@impromptu/db";
import { betterAuth } from "better-auth";
import { APIError, getOAuthState } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";
import { z } from "zod";
import { reports } from "./reports";
import { assessments } from "./assessments";
import { goals } from "./goals";
import { lessons } from "./lessons";
import { verificationEmail, type Mailer } from "./mailer";
import type { Models } from "./models";
import { pronunciation, type Speech } from "./pronunciation";
import { realtimeBroker, voiceMinutesRoute, type Realtime } from "./realtime";
import type { Transcriber } from "./recordings";
import { focusItemsRoute, roadmap } from "./roadmap";
import { roleplays } from "./roleplays";
import { progressRoute } from "./progress";
import { skillProfileRoutes } from "./scoring";
import { metricsMiddleware, metricsRegistry } from "./metrics";

export type { Mailer, Models, Realtime, Speech, Transcriber };

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
  KENPATH_VOICE?: string;
  // Parent domain shared by web and API in production, e.g. impromptu.app
  COOKIE_DOMAIN?: string;
  METRICS_ENABLED?: string;
};

export const defaultSettings = {
  // Moving-average weight of a new result: new = old + α × (result − old).
  alphaAssessment: 0.5,
  alphaLesson: 0.15,
  // Recorded answers (speakPrompt etc.) per local day.
  recordingMinutesPerDay: 30,
  // Roleplay voice calls per local day; the Voice Assessment doesn't count.
  realtimeMinutesPerDay: 15,
};
export type Settings = typeof defaultSettings;

export type Deps = {
  db: Db;
  now: () => Date;
  env: Env;
  models: Models;
  mailer: Mailer;
  speech: Speech;
  realtime: Realtime;
  transcriber: Transcriber;
  // Runs `fn` after `ms` and returns a cancel; injected so tests fire timers on the test clock.
  schedule?: Schedule;
  settings?: Partial<Settings>;
};

export type Schedule = (ms: number, fn: () => unknown) => () => void;
const setTimer: Schedule = (ms, fn) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

export type User = typeof schema.user.$inferSelect;
export type AppEnv = { Variables: { user: User } };

export function createApp(deps: Deps) {
  const { db, env, mailer } = deps;
  const settings = { ...defaultSettings, ...deps.settings };
  const broker = realtimeBroker({ ...deps, schedule: deps.schedule ?? setTimer });
  const auth = betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_ORIGIN],
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true, requireEmailVerification: true },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: ({ user, url }) => mailer.send(verificationEmail(user.email, url)),
    },
    socialProviders: env.GOOGLE_CLIENT_ID
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET! } }
      : {},
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const state = await getOAuthState();
            if (state?.timezone === undefined) return;
            const parsed = timezone.safeParse(state.timezone);
            if (!parsed.success) throw new APIError("BAD_REQUEST", { message: "Invalid timezone" });
            // OAuth state is client input. Apply it only at sign-up, preserving later Settings choices.
            return { data: { ...user, timezone: parsed.data } };
          },
        },
      },
    },
    advanced: env.COOKIE_DOMAIN ? { crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN } } : {},
    user: {
      deleteUser: { enabled: true, beforeDelete: (user) => broker.hangup(user.id) },
      additionalFields: {
        timezone: {
          type: "string",
          required: false,
          defaultValue: "UTC",
          validator: { input: timezone },
        },
      },
    },
  });

  const app = new Hono<AppEnv>()
    .use("*", metricsMiddleware(env.METRICS_ENABLED === "true"))
    .get("/metrics", async (c) => {
      if (env.METRICS_ENABLED !== "true") return c.notFound();
      return c.text(await metricsRegistry.metrics(), 200, {
        "Content-Type": metricsRegistry.contentType,
      });
    })
    .use("/api/*", cors({ origin: env.WEB_ORIGIN, credentials: true }))
    // Better Auth has no endpoint for this; sign-in shows the Google button only when it's configured.
    .get("/api/auth/providers", (c) => c.json({ google: Boolean(env.GOOGLE_CLIENT_ID) }))
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    // Registered after the auth handler, so it guards every other /api route.
    .use("/api/*", async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      if (!session) return c.json({ error: "Unauthorized" }, 401);
      if (!session.user.emailVerified) return c.json({ error: "Verify your email before using Impromptu." }, 403);
      c.set("user", session.user as User);
      await next();
    })
    .get("/api/me", (c) => c.json(c.var.user))
    .route("/api/reports", reports(deps))
    .route("/api/goals", goals(deps))
    .route("/api/assessments", assessments({ ...deps, settings, broker }))
    .route("/api/roadmap", roadmap(deps))
    .route("/api/lessons", lessons({ ...deps, settings }))
    .route("/api/roleplays", roleplays({ ...deps, settings, broker }))
    .route("/api/pronunciation", pronunciation(deps, env.KENPATH_VOICE))
    .route("/api/skill-profile", skillProfileRoutes(db))
    .route("/api/voice-minutes", voiceMinutesRoute(broker, settings.realtimeMinutesPerDay))
    .route("/api/progress", progressRoute(deps))
    .route("/api/focus-items", focusItemsRoute(db));

  // shortcut: generated route entries lack schemas, migrate handlers to OpenAPI when payload docs are needed.
  const paths: Record<string, Record<string, unknown>> = {};
  for (const { method, path } of app.routes) {
    if (!path.startsWith("/api/") || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) continue;
    const openApiPath = path.replace(/:([^/]+)/g, "{$1}").replace(/\/\*$/, "/{path}");
    const operationMethod = method.toLowerCase();
    const tag = openApiPath.startsWith("/api/auth/")
      ? "Authentication"
      : (openApiPath.split("/")[2] ?? "API").replace(/(^|-)(\w)/g, (_, __, letter: string) => letter.toUpperCase());
    const operation = {
      tags: [tag],
      summary: `${method} ${openApiPath}`,
      operationId: `${method.toLowerCase()}_${openApiPath.replace(/[^a-zA-Z0-9]+/g, "_")}`,
      ...(openApiPath.includes("{") && {
        parameters: [...openApiPath.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
          name,
          in: "path",
          required: true,
          schema: { type: "string" },
        })),
      }),
      ...(!openApiPath.startsWith("/api/auth/") &&
        openApiPath !== "/api/auth/providers" && {
          security: [{ sessionCookie: [] }],
        }),
      responses: { default: { description: "Endpoint response; schema not yet documented." } },
    };
    paths[openApiPath] = { ...paths[openApiPath], [operationMethod]: operation };
  }
  if (!Object.keys(paths).length) throw new Error("OpenAPI document has no API routes");

  app.route(
    "/docs",
    Scalar.serve({
      theme: "kepler",
      authentication: { preferredSecurityScheme: "sessionCookie" },
      document: {
        openapi: "3.1.0",
        info: {
          title: "Impromptu API",
          version: "1.0.0",
          description:
            "Interactive route reference generated from registered Hono routes. Request and response schemas are not yet declared in OpenAPI.",
        },
        servers: [{ url: "/" }],
        components: {
          securitySchemes: {
            sessionCookie: {
              type: "apiKey",
              in: "cookie",
              name: "better-auth.session_token",
              description: "Better Auth session cookie",
            },
          },
        },
        paths,
      },
    }),
  );

  return app;
}

export type AppType = ReturnType<typeof createApp>;
