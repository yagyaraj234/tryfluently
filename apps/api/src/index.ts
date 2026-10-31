import { createDb } from "@fluently/db";
import { dodoPayments, startBillingCleanup } from "./billing";
import { createApp, type Deps, type Env } from "./app";
import { resendMailer } from "./mailer";
import { startAssessmentJobs } from "./assessment-jobs";
import { startStreakReminders } from "./streak-reminders";
import { modelsFromSettings } from "./models";
import { kenpathSpeech } from "./pronunciation";
import { openaiRealtime } from "./realtime";
import { openaiTranscriber } from "./recordings";
import { rimeRealtime } from "./rime";
import { failover } from "./failover";
import { websocket } from "hono/bun";
import { installShutdown } from "./shutdown";

const env = process.env as Record<string, string>;
const required = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "WEB_ORIGIN",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "OPENAI_API_KEY",
];
required.push("KENPATH_BASE_URL", "KENPATH_API_KEY", "KENPATH_MODEL");
// Live calls go to OpenAI unless REALTIME_PROVIDER=rime; with both keys each falls back to the other (ADR 0005).
if (env.REALTIME_PROVIDER === "rime") required.push("RIME_API_KEY");
for (const key of required) {
  if (!env[key]) throw new Error(`Missing env var ${key}`);
}

const deps = {
  db: createDb(env.DATABASE_URL!),
  payments: dodoPayments(env as Env),
  now: () => new Date(),
  env: env as Env,
  models: modelsFromSettings(env),
  mailer: resendMailer(env.RESEND_API_KEY!, env.EMAIL_FROM!),
  speech: kenpathSpeech(env.KENPATH_BASE_URL!, env.KENPATH_API_KEY!, env.KENPATH_MODEL!),
  realtime: env.RIME_API_KEY
    ? failover(
        {
          openai: openaiRealtime(env.OPENAI_API_KEY!, env.MODEL_REALTIME || undefined),
          rime: rimeRealtime(env.RIME_API_KEY),
        },
        env.REALTIME_PROVIDER === "rime" ? "rime" : "openai",
      )
    : openaiRealtime(env.OPENAI_API_KEY!, env.MODEL_REALTIME || undefined),
  transcriber: openaiTranscriber(env.OPENAI_API_KEY!),
} satisfies Deps;
const app = createApp(deps);

export const serverOptions = {
  port: Number(env.PORT ?? 3000),
  // AI streams can pause while the model thinks; Bun's default closes idle sockets after 10 seconds.
  idleTimeout: 120,
  fetch: app.fetch,
  websocket,
};

if (import.meta.main) {
  const server = Bun.serve(serverOptions);
  installShutdown(server, app, deps.db, [
    startAssessmentJobs(deps),
    startStreakReminders(deps),
    startBillingCleanup(deps),
  ]);
}
