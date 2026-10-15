import { schema } from "@impromptu/db";
import { generateText, type LanguageModelUsage } from "ai";
import type { Deps } from "./app";

type GenerateOptions = Parameters<typeof generateText>[0];

const tokens = (u: LanguageModelUsage) => ({
  inputTokens: u.inputTokens,
  cachedInputTokens: u.inputTokenDetails?.cacheReadTokens,
  outputTokens: u.outputTokens,
  totalTokens: u.totalTokens,
});

// Writes the ai_usage row for one text call, so spend can be queried per day and per Learner.
export async function logTextUsage(
  { db }: Pick<Deps, "db">,
  userId: string,
  call: { id: string; startedAt: Date; seconds: number; usage: LanguageModelUsage },
) {
  await db.insert(schema.aiUsage).values({
    userId,
    kind: "text",
    callId: call.id,
    startedAt: call.startedAt,
    seconds: call.seconds,
    usage: tokens(call.usage),
  });
}

export async function generate<O extends GenerateOptions>(deps: Pick<Deps, "db" | "now">, userId: string, options: O) {
  const startedAt = deps.now();
  const t0 = performance.now();
  const result = await generateText(options);
  await logTextUsage(deps, userId, {
    id: result.response.id,
    startedAt,
    seconds: (performance.now() - t0) / 1000,
    usage: result.totalUsage,
  });
  return result;
}
