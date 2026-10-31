import { schema } from "@fluently/db";
import type { UIMessage } from "ai";
import { and, eq, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps, Schedule } from "./app";

export type RealtimeEvent = { type: string; [key: string]: any };
export type RealtimeSession = Record<string, unknown>;
// Hangup confirms provider teardown; it must not wait for the socket's onClose handler.
export type Sideband = { send(event: object): void; hangup(): Promise<void> };

// Thin client over OpenAI Realtime, faked in tests.
export type Realtime = {
  // Posts the browser's SDP offer with the owner's key; the answer goes back to the browser, the call id stays here.
  createCall(sdp: string, session: RealtimeSession): Promise<{ answer: string; callId: string }>;
  // Opens the server's sideband connection to a live call.
  attach(
    callId: string,
    handlers: { onEvent(e: RealtimeEvent): void | Promise<void>; onClose(): void | Promise<void> },
  ): Sideband;
};

const API = "https://api.openai.com/v1/realtime";

export const openaiRealtime = (apiKey: string, model = sessionConfig.model): Realtime => {
  const authorization = `Bearer ${apiKey}`;
  return {
    async createCall(sdp, session) {
      const body = new FormData();
      body.set("sdp", sdp);
      body.set("session", JSON.stringify({ ...session, model }));
      const res = await fetch(`${API}/calls`, {
        method: "POST",
        headers: { authorization },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`OpenAI Realtime ${res.status}: ${await res.text()}`);
      const callId = res.headers.get("location")?.split("/").pop();
      if (!callId) throw new Error("OpenAI Realtime returned no call id");
      return { answer: await res.text(), callId };
    },
    attach(callId, { onEvent, onClose }) {
      // Bun's WebSocket takes headers, which browsers' doesn't.
      const ws = new WebSocket(`${API}?call_id=${callId}`, { headers: { authorization } } as any);
      let hungUp = false;
      ws.onmessage = (m) =>
        void Promise.resolve(onEvent(JSON.parse(String(m.data)))).catch((error) =>
          console.error("realtime event failed", error),
        );
      ws.onclose = () => {
        if (hungUp) return;
        void Promise.resolve()
          .then(onClose)
          .catch((error) => console.error("realtime close failed", error));
      };
      const send = (event: object) =>
        ws.readyState === WebSocket.OPEN
          ? ws.send(JSON.stringify(event))
          : ws.addEventListener("open", () => ws.send(JSON.stringify(event)), { once: true });
      return {
        send,
        async hangup() {
          const res = await fetch(`${API}/calls/${callId}/hangup`, {
            method: "POST",
            headers: { authorization },
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) throw new Error(`OpenAI Realtime hangup ${res.status}: ${await res.text()}`);
          hungUp = true;
          ws.close();
        },
      };
    },
  };
};

// Token limits keep a cache miss from running up the bill.
// ponytail: limits are first guesses; tune them from realtime ai_usage once real calls run.
export const sessionConfig = {
  type: "realtime",
  model: "gpt-realtime",
  max_output_tokens: 1024,
  truncation: { type: "retention_ratio", retention_ratio: 0.8, token_limits: { post_instructions: 8000 } },
  audio: { input: { transcription: { model: "gpt-4o-transcribe" }, turn_detection: { type: "semantic_vad" } } },
};

// Lets the model hang up once it has spoken its closing line.
export const endCallTool = {
  type: "function",
  name: "end_call",
  description: "End the call after you have spoken a short closing sentence.",
  parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
};

export type CallPurpose = "assessment" | "roleplay";

// Starts and tracks Realtime calls: one live call per Learner, transcripts and voice timing collected from the
// sideband, and an ai_usage row written when the call closes. No audio is kept.
const WRAP_UP_SECONDS = 60;
const wrapUp =
  "\n\nAbout a minute is left. Start to wrap up now: ask no new questions, and close the conversation politely.";

// A call that replaces a dropped one carries on from the saved transcript instead of greeting the Learner again.
// ponytail: keeps the last 12k characters; summarise older turns if long Roleplays lose their opening.
export const resumeFrom = (prior: UIMessage[]) => {
  const lines = prior.flatMap((m) => {
    const text = m.parts
      .flatMap((p) => (p.type === "text" ? [p.text] : []))
      .join(" ")
      .trim();
    return text ? [`${m.role === "user" ? "Learner" : "You"}: ${text}`] : [];
  });
  return lines.length
    ? `\n\nThe call dropped and has reconnected. The conversation so far:\n${lines.join("\n").slice(-12_000)}\nContinue from where it stopped: don't greet the Learner again or start over.`
    : "";
};

type SaveFailure = { error: unknown };
type Live = {
  sideband?: Sideband;
  stop?: () => Promise<void>;
  ready: Promise<void>;
  closed: Promise<SaveFailure | undefined>;
  targetId?: string;
  startedAt?: Date;
  endsAt?: Date;
};

export function realtimeBroker({
  db,
  now,
  realtime,
  schedule,
  limitMinutes,
}: Pick<Deps, "db" | "now" | "realtime"> & { schedule: Schedule; limitMinutes: number }) {
  // shortcut: call slots and timers live in memory; use a durable registry before scaling out or requiring restart recovery.
  const live = new Map<string, Live>();
  let closing: Promise<void> | undefined;

  // Count only the portion of each live call inside this UTC calendar month.
  async function voiceMinutes(userId: string) {
    const at = now();
    const monthStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
    const rows = await db
      .select({ startedAt: schema.aiUsage.startedAt, seconds: schema.aiUsage.seconds })
      .from(schema.aiUsage)
      .where(
        and(
          eq(schema.aiUsage.userId, userId),
          eq(schema.aiUsage.kind, "realtime"),
          lt(schema.aiUsage.startedAt, monthEnd),
          sql`${schema.aiUsage.startedAt} + ${schema.aiUsage.seconds} * interval '1 second' > ${monthStart.toISOString()}::timestamp`,
        ),
      );
    const call = live.get(userId);
    if (call?.startedAt)
      rows.push({ startedAt: call.startedAt, seconds: (at.getTime() - call.startedAt.getTime()) / 1000 });
    const used = rows.reduce((sum, row) => {
      const start = Math.max(row.startedAt.getTime(), monthStart.getTime());
      const end = Math.min(row.startedAt.getTime() + row.seconds * 1000, at.getTime(), monthEnd.getTime());
      return sum + Math.max(0, end - start) / 1000;
    }, 0);
    return {
      limitMinutes,
      usedSeconds: Math.ceil(used),
      remainingSeconds: Math.max(0, Math.floor(limitMinutes * 60 - used)),
      resetsAt: monthEnd.toISOString(),
      callEndsAt: call?.endsAt?.toISOString() ?? null,
    };
  }

  // Claim the call slot before checking credit, so overlapping starts cannot reuse a stale allowance.
  async function start(
    userId: string,
    opts: {
      sdp: string;
      instructions: string;
      purpose: CallPurpose;
      tools?: unknown[];
      endTool?: string;
      targetId?: string;
      budgetSeconds?: number;
      // What the target already holds from earlier calls; this call's messages are saved after it.
      prior?: unknown[];
      onTranscript(t: UIMessage[]): Promise<unknown>;
    },
  ) {
    if (closing) return { unavailable: true as const };
    if (live.has(userId)) return { busy: true as const };
    let ready!: () => void;
    const closed = Promise.withResolvers<SaveFailure | undefined>();
    const entry: Live = {
      ready: new Promise((r) => (ready = r)),
      closed: closed.promise,
      targetId: opts.targetId,
    };
    live.set(userId, entry); // claimed before the network call, so two quick requests can't both start one
    const deadline = opts.budgetSeconds === undefined ? undefined : now().getTime() + opts.budgetSeconds * 1000;

    let call: { answer: string; callId: string };
    let budgetSeconds: number;
    try {
      const budget = await voiceMinutes(userId);
      budgetSeconds = Math.min(budget.remainingSeconds, opts.budgetSeconds ?? Infinity);
      if (budgetSeconds <= 0) {
        live.delete(userId);
        closed.resolve(undefined);
        ready();
        return { capped: budget };
      }
      call = await realtime.createCall(opts.sdp, opts.tools ? { ...sessionConfig, tools: opts.tools } : sessionConfig);
    } catch (e) {
      live.delete(userId);
      closed.resolve(undefined);
      ready();
      throw e;
    }

    const startedAt = now();
    entry.startedAt = startedAt;
    entry.endsAt = new Date(Math.min(startedAt.getTime() + budgetSeconds * 1000, deadline ?? Infinity));
    const timers: (() => void)[] = [];
    const transcript: UIMessage[] = [];
    const prior = (opts.prior ?? []) as UIMessage[];
    const instructions = opts.instructions + resumeFrom(prior);
    const priorIds = new Set(prior.map((m) => m.id));
    const timing = new Map<string, { speechStartMs?: number; speechEndMs?: number }>();
    const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    let saving: Promise<SaveFailure | undefined> = Promise.resolve(undefined);
    let stopping: Promise<void> | undefined;
    let cancelRetry: (() => void) | undefined;
    let retries = 0;
    let ending = false;
    let endResponseId: string | undefined;
    let cancelEndFallback: (() => void) | undefined;

    const endFromTool = async () => {
      if (ending) return;
      ending = true;
      cancelEndFallback?.();
      await hangup(userId, opts.targetId);
    };

    const add = (message: UIMessage) => {
      transcript.push(message);
      saving = saving.then(async () => {
        try {
          await opts.onTranscript([...prior, ...transcript.filter((m) => !priorIds.has(m.id))]);
        } catch (error) {
          console.error("realtime transcript save failed", error);
          return { error };
        }
      });
    };

    entry.stop = () => {
      if (stopping) return stopping;
      cancelRetry?.();
      stopping = Promise.resolve().then(async () => {
        try {
          await entry.sideband!.hangup();
        } catch (error) {
          stopping = undefined;
          // A dropped sideband does not prove the browser's call ended. Keep its slot and meter until teardown succeeds.
          cancelRetry = schedule(Math.min(30_000, 1_000 * 2 ** retries++), () =>
            entry.stop!().catch((error) => console.error("realtime hangup retry failed", error)),
          );
          throw error;
        }
        const endedAt = now();
        for (const cancel of timers) cancel();
        cancelEndFallback?.();
        let failure = await saving;
        try {
          await db.insert(schema.aiUsage).values({
            userId,
            kind: "realtime",
            callId: call.callId,
            startedAt,
            seconds: (endedAt.getTime() - startedAt.getTime()) / 1000,
            usage: { ...usage, purpose: opts.purpose },
          });
        } catch (error) {
          failure ??= { error };
        } finally {
          live.delete(userId);
          closed.resolve(failure);
        }
        if (failure) throw failure.error;
      });
      return stopping;
    };

    entry.sideband = realtime.attach(call.callId, {
      async onEvent(e) {
        if (e.type === "input_audio_buffer.speech_started") timing.set(e.item_id, { speechStartMs: e.audio_start_ms });
        else if (e.type === "input_audio_buffer.speech_stopped")
          timing.set(e.item_id, { ...timing.get(e.item_id), speechEndMs: e.audio_end_ms });
        else if (e.type === "conversation.item.input_audio_transcription.completed") {
          const t = timing.get(e.item_id);
          add({
            id: e.item_id,
            role: "user",
            parts: [{ type: "text", text: e.transcript }],
            ...(t && { metadata: t }),
          });
        } else if (e.type === "response.output_audio_transcript.done")
          add({ id: e.item_id, role: "assistant", parts: [{ type: "text", text: e.transcript }] });
        else if (e.type === "response.done" && e.response?.usage) {
          const u = e.response.usage;
          usage.inputTokens += u.input_tokens ?? 0;
          usage.cachedInputTokens += u.input_token_details?.cached_tokens ?? 0;
          usage.outputTokens += u.output_tokens ?? 0;
        } else if (
          opts.endTool &&
          e.type === "response.function_call_arguments.done" &&
          e.name === opts.endTool &&
          !endResponseId
        ) {
          endResponseId = e.response_id;
          // The model should have spoken its closing line; do not leave the call open if that audio event is missing.
          cancelEndFallback = schedule(5_000, endFromTool);
        } else if (endResponseId === e.response_id && e.type === "output_audio_buffer.stopped") {
          await endFromTool();
        }
      },
      async onClose() {
        await entry.ready;
        await entry.stop!();
      },
    });
    ready();
    entry.sideband.send({ type: "session.update", session: { type: "realtime", instructions } });
    {
      const remainingSeconds = Math.max(0, (entry.endsAt.getTime() - now().getTime()) / 1000);
      const sideband = entry.sideband;
      timers.push(
        schedule(Math.max(0, remainingSeconds - WRAP_UP_SECONDS) * 1000, () =>
          sideband.send({
            type: "session.update",
            session: { type: "realtime", instructions: instructions + wrapUp },
          }),
        ),
        schedule(remainingSeconds * 1000, () =>
          hangup(userId, opts.targetId).catch((error) => console.error("realtime timed hangup failed", error)),
        ),
      );
    }
    return { answer: call.answer };
  }

  // Hangs up the Learner's live call, if any, and waits until its transcript and usage are saved.
  async function hangup(userId: string, targetId?: string) {
    const entry = live.get(userId);
    if (!entry || (targetId !== undefined && entry.targetId !== targetId)) return;
    await entry.ready;
    await entry.stop?.();
  }

  function shutdown() {
    return (closing ??= Promise.resolve().then(async () => {
      const results = await Promise.all(
        [...live].map(async ([userId, entry]) => {
          try {
            await hangup(userId);
          } catch (error) {
            console.error("Realtime shutdown failed", error);
          }
          // Failed hangups keep their slot and existing retry timer until provider teardown succeeds.
          return entry.closed;
        }),
      );
      const failures = results.flatMap((result) => (result ? [result.error] : []));
      if (failures.length) throw new AggregateError(failures, "Failed to save closing voice calls");
    }));
  }

  return { start, hangup, voiceMinutes, shutdown };
}
export type RealtimeBroker = ReturnType<typeof realtimeBroker>;

export const voiceMinutesRoute = (broker: RealtimeBroker) =>
  new Hono<AppEnv>().get("/", async (c) => c.json(await broker.voiceMinutes(c.var.user.id)));

export const voiceLimitMessage =
  "You've used this month's voice minutes. We're in beta. Email hey@yagyaraj.com to request more voice credits, or use text mode.";
