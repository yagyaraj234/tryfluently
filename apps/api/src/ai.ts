import { schema } from "@impromptu/db";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateText,
  NoObjectGeneratedError,
  streamText,
  type LanguageModelUsage,
  type UIMessage,
} from "ai";
import type { Deps } from "./app";

type Ctx = Pick<Deps, "db" | "now">;

const tokens = (u: LanguageModelUsage) => ({
  inputTokens: u.inputTokens,
  cachedInputTokens: u.inputTokenDetails?.cacheReadTokens,
  outputTokens: u.outputTokens,
  totalTokens: u.totalTokens,
});

// Writes the ai_usage row for one text call, so spend can be queried per day and per Learner.
async function logTextUsage(
  { db }: Ctx,
  userId: string,
  call: { id?: string; startedAt: Date; t0: number; usage?: LanguageModelUsage },
) {
  await db.insert(schema.aiUsage).values({
    userId,
    kind: "text",
    callId: call.id,
    startedAt: call.startedAt,
    seconds: (performance.now() - call.t0) / 1000,
    usage: call.usage && tokens(call.usage),
  });
}

export async function generate<O extends Parameters<typeof generateText>[0]>(ctx: Ctx, userId: string, options: O) {
  const call = { startedAt: ctx.now(), t0: performance.now() };
  try {
    const result = await generateText(options);
    await logTextUsage(ctx, userId, { ...call, id: result.response.id, usage: result.totalUsage });
    return result;
  } catch (e) {
    // Output that fails its schema was still paid for.
    if (NoObjectGeneratedError.isInstance(e))
      await logTextUsage(ctx, userId, { ...call, id: e.response?.id, usage: e.usage });
    throw e;
  }
}

// One chat turn: streams the reply as a UI message stream and saves the updated history when it finishes.
export async function streamChat(
  ctx: Ctx,
  userId: string,
  {
    messages,
    save,
    ...options
  }: Omit<Parameters<typeof streamText>[0], "messages" | "prompt"> & {
    messages: UIMessage[];
    save: (messages: UIMessage[]) => Promise<unknown>;
  },
) {
  const call = { startedAt: ctx.now(), t0: performance.now() };
  const result = streamText({ ...options, messages: await convertToModelMessages(messages) } as Parameters<
    typeof streamText
  >[0]);
  return createUIMessageStreamResponse({
    stream: result.toUIMessageStream({
      originalMessages: messages,
      generateMessageId: () => crypto.randomUUID(),
      onEnd: async ({ messages }) => {
        // A server tool that throws (e.g. giveFeedback's database write) only reaches the model as a tool error.
        for (const s of await result.steps)
          for (const part of s.content)
            if (part.type === "tool-error") console.error(`tool ${part.toolName} failed`, part.error);
        await save(messages);
        await logTextUsage(ctx, userId, { ...call, id: (await result.response).id, usage: await result.totalUsage });
      },
    }),
  });
}
