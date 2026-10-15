import { createDb } from "@impromptu/db";
import { createApp } from "./app";
import { resendMailer } from "./mailer";
import { modelsFromSettings } from "./models";

const env = process.env as Record<string, string>;
for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "WEB_ORIGIN", "RESEND_API_KEY", "EMAIL_FROM"]) {
  if (!env[key]) throw new Error(`Missing env var ${key}`);
}

export default {
  port: Number(env.PORT ?? 3000),
  fetch: createApp({
    db: createDb(env.DATABASE_URL!),
    now: () => new Date(),
    env: env as any,
    models: modelsFromSettings(env),
    mailer: resendMailer(env.RESEND_API_KEY!, env.EMAIL_FROM!),
  }).fetch,
};
