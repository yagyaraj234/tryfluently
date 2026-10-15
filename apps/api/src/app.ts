import { schema, type Db } from "@impromptu/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

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

export type Deps = { db: Db; now: () => Date; env: Env };

export function createApp({ db, now, env }: Deps) {
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

  type User = typeof auth.$Infer.Session.user;

  return (
    new Hono<{ Variables: { user: User; now: () => Date } }>()
      .use("/api/*", cors({ origin: env.WEB_ORIGIN, credentials: true }))
      .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
      // Registered after the auth handler, so it guards every other /api route.
      .use("/api/*", async (c, next) => {
        const session = await auth.api.getSession({ headers: c.req.raw.headers });
        if (!session) return c.json({ error: "Unauthorized" }, 401);
        c.set("user", session.user);
        c.set("now", now);
        await next();
      })
      .get("/api/me", (c) => c.json(c.var.user))
  );
}

export type AppType = ReturnType<typeof createApp>;
