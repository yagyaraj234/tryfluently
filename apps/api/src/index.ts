import { createDb } from "@impromptu/db";
import { createApp, type Deps, type Env } from "./app";
import { resendMailer } from "./mailer";
import { startAssessmentJobs } from "./assessment-jobs";
import { modelsFromSettings } from "./models";
import { kenpathSpeech } from "./pronunciation";
import { openaiRealtime } from "./realtime";
import { openaiTranscriber } from "./recordings";

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
for (const key of required) {
  if (!env[key]) throw new Error(`Missing env var ${key}`);
}

const deps = {
  db: createDb(env.DATABASE_URL!),
  now: () => new Date(),
  env: env as Env,
  models: modelsFromSettings(env),
  mailer: resendMailer(env.RESEND_API_KEY!, env.EMAIL_FROM!),
  speech: kenpathSpeech(env.KENPATH_BASE_URL!, env.KENPATH_API_KEY!, env.KENPATH_MODEL!),
  realtime: openaiRealtime(env.OPENAI_API_KEY!, env.MODEL_REALTIME || undefined),
  transcriber: openaiTranscriber(env.OPENAI_API_KEY!),
} satisfies Deps;
if (import.meta.main) startAssessmentJobs(deps);

export default {
  port: Number(env.PORT ?? 3000),
  // AI streams can pause while the model thinks; Bun's default closes idle sockets after 10 seconds.
  idleTimeout: 120,
  fetch: createApp(deps).fetch,
};
