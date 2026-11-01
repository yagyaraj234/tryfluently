import { schema } from "@fluently/db";
import type { UIMessage } from "ai";
import { Hono, type Context } from "hono";
import type { AppEnv, Deps, Schedule } from "./app";
import {
  armVoice,
  freeVoiceUsed,
  checkpointVoice,
  paidCredits,
  recoverVoice,
  reserveVoice,
  settleVoice,
  PRO_MINUTES,
} from "./billing-credits";

export type RealtimeEvent = { type: string; [key: string]: any };
export type RealtimeSession = Record<string, unknown>;
// Hangup confirms provider teardown; it must not wait for the socket's onClose handler.
export type Sideband = { send(event: object): void; hangup(): Promise<void> };

export type Provider = "openai" | "rime";
// The browser's end of a Rime call, as the API's WebSocket route sees it.
export type BrowserSocket = { send(data: string): void; close(code?: number): void };

// Thin client over a speech-to-speech provider (OpenAI Realtime or Rime Prism, ADR 0005), faked in tests.
export type Realtime = {
  // Starts a call with the owner's key. OpenAI answers the browser's SDP offer over WebRTC; Rime has no answer,
  // and the browser joins over the API's WebSocket instead. The call id stays here. `avoid` is the provider a resumed
  // call dropped from; `voiceKey` picks the voice, so a call that reconnects keeps the voice it started with.
  createCall(
    sdp: string,
    session: RealtimeSession,
    avoid?: Provider,
    voiceKey?: string,
  ): Promise<{ answer?: string; callId: string; provider: Provider }>;
  // Opens the server's sideband connection to a live call. `failed` is false when the provider ended it normally.
  attach(
    callId: string,
    handlers: { onEvent(e: RealtimeEvent): void | Promise<void>; onClose(failed?: boolean): void | Promise<void> },
  ): Sideband;
  // Connects the browser's WebSocket to a Rime call; undefined when there's no such call to join.
  join?(callId: string, browser: BrowserSocket): { message(data: string): void; close(): void } | undefined;
};

// Random, or the same item every time for the same key.
export function pick<T>(list: readonly T[], key?: string) {
  if (!key) return list[Math.floor(Math.random() * list.length)]!;
  let hash = 0;
  for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return list[Math.abs(hash) % list.length]!;
}
const openaiVoices = ["alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse", "marin", "cedar"];

const API = "https://api.openai.com/v1/realtime";

export const openaiRealtime = (apiKey: string, model = sessionConfig.model): Realtime => {
  const authorization = `Bearer ${apiKey}`;
  return {
    async createCall(sdp, session, _avoid, voiceKey) {
      const body = new FormData();
      body.set("sdp", sdp);
      body.set(
        "session",
        JSON.stringify({
          ...session,
          model,
          audio: { ...(session.audio as object), output: { voice: pick(openaiVoices, voiceKey) } },
        }),
      );
      const res = await fetch(`${API}/calls`, {
        method: "POST",
        headers: { authorization },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`OpenAI Realtime ${res.status}: ${await res.text()}`);
      const callId = res.headers.get("location")?.split("/").pop();
      if (!callId) throw new Error("OpenAI Realtime returned no call id");
      return { answer: await res.text(), callId, provider: "openai" };
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
          .then(() => onClose())
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
    ? `\n\nThe call dropped and has reconnected. The conversation so far:\n${lines.join("\n").slice(-12_000)}\nSpeak first and carry on from where it stopped: don't greet the Learner again or start over.`
    : "";
};

type SaveFailure = { error: unknown };
type Live = {
  sideband?: Sideband;
  stop?: () => Promise<void>;
  ready: Promise<void>;
  closed: Promise<SaveFailure | undefined>;
  targetId?: string;
  callId?: string;
  freeSeconds?: number;
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
  const unsettled = new Map<string, () => Promise<void>>();
  // Targets whose call the coach ended on purpose, so a browser that took the hangup for a drop can't resume them.
  // ponytail: grows by one id per coach-ended call until restart; prune by age if that ever matters.
  const ended = new Set<string>();
  let closing: Promise<void> | undefined;

  // Count only the portion of each live call inside this UTC calendar month.
  async function voiceMinutes(userId: string) {
    const at = now();
    const retry = unsettled.get(userId);
    if (retry) {
      await retry();
      unsettled.delete(userId);
    }
    if (!live.get(userId)?.startedAt) await recoverVoice(db, userId, at);
    const monthEnd = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
    const call = live.get(userId);
    const used = await freeVoiceUsed(
      db,
      userId,
      at,
      call?.startedAt ? { startedAt: call.startedAt, freeSeconds: call.freeSeconds ?? 0 } : undefined,
    );
    const paid = await paidCredits(db, userId, at);
    const monthlyRemainingSeconds = Math.max(0, Math.floor(paid.pro?.remaining ?? limitMinutes * 60 - used));
    return {
      limitMinutes: paid.pro ? PRO_MINUTES : limitMinutes,
      usedSeconds: paid.pro ? Math.ceil(paid.pro.spent) : Math.ceil(used),
      remainingSeconds: Math.floor(monthlyRemainingSeconds + paid.purchasedSeconds),
      monthlyRemainingSeconds,
      purchasedRemainingSeconds: Math.floor(paid.purchasedSeconds),
      resetsAt: (paid.pro?.expiresAt ?? monthEnd).toISOString(),
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
      // Resuming a call that dropped from this provider: the other is tried first (ADR 0005).
      after?: Provider;
      onTranscript(t: UIMessage[]): Promise<unknown>;
    },
  ) {
    if (closing) return { unavailable: true as const };
    // The routes hang up the dropped call before reading `prior`, so its last saved turns are in it.
    if (opts.after && opts.targetId && ended.has(opts.targetId)) return { ended: true as const };
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

    const prior = (opts.prior ?? []) as UIMessage[];
    const instructions = opts.instructions + resumeFrom(prior);
    let call: Awaited<ReturnType<Realtime["createCall"]>>;
    let budgetSeconds: number;
    let reservationId: string | undefined;
    let reservedEndsAt: Date | undefined;
    try {
      const budget = await voiceMinutes(userId);
      budgetSeconds = Math.min(budget.remainingSeconds, opts.budgetSeconds ?? Infinity);
      if (budgetSeconds <= 0) {
        live.delete(userId);
        closed.resolve(undefined);
        ready();
        return { capped: budget };
      }
      const reserved = await reserveVoice(db, userId, now(), limitMinutes * 60, budgetSeconds);
      if (!reserved.reservation) {
        live.delete(userId);
        closed.resolve(undefined);
        ready();
        return "busy" in reserved ? { busy: true as const } : { capped: budget };
      }
      reservationId = reserved.reservation.id;
      entry.freeSeconds = reserved.reservation.freeSeconds;
      reservedEndsAt = reserved.boundary;
      budgetSeconds = reserved.budgetSeconds;
      // Instructions go with the call, so they're in place before the browser asks the coach to open it.
      call = await realtime.createCall(
        opts.sdp,
        { ...sessionConfig, instructions, ...(opts.tools && { tools: opts.tools }) },
        opts.after,
        opts.targetId,
      );
    } catch (e) {
      try {
        if (reservationId) await settleVoice(db, reservationId, now(), 0);
      } finally {
        live.delete(userId);
        closed.resolve(undefined);
        ready();
      }
      throw e;
    }

    const startedAt = now();
    entry.startedAt = startedAt;
    entry.callId = call.callId;
    entry.endsAt = new Date(
      Math.min(startedAt.getTime() + budgetSeconds * 1000, deadline ?? Infinity, reservedEndsAt?.getTime() ?? Infinity),
    );
    const timers: (() => void)[] = [];
    const transcript: UIMessage[] = [];
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
      if (opts.targetId) ended.add(opts.targetId);
      cancelEndFallback?.();
      await hangup(userId, opts.targetId);
    };

    const add = (message: UIMessage) => {
      const elapsed = (now().getTime() - startedAt.getTime()) / 1000;
      transcript.push(message);
      saving = saving.then(async () => {
        try {
          await opts.onTranscript([...prior, ...transcript.filter((m) => !priorIds.has(m.id))]);
          await checkpointVoice(db, reservationId!, elapsed);
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
        const saveUsage = () =>
          settleVoice(db, reservationId!, endedAt, (endedAt.getTime() - startedAt.getTime()) / 1000, {
            callId: call.callId,
            startedAt,
            usage: { ...usage, purpose: opts.purpose, provider: call.provider },
          });
        try {
          await saveUsage();
        } catch (error) {
          unsettled.set(userId, saveUsage);
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
          await checkpointVoice(db, reservationId!, (now().getTime() - startedAt.getTime()) / 1000);
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
    try {
      await armVoice(db, reservationId!, startedAt, entry.endsAt, call.callId);
    } catch (error) {
      ready();
      try {
        await entry.stop();
      } catch (teardownError) {
        console.error("Failed call setup teardown will retry", teardownError);
      }
      throw error;
    }
    ready();
    if (entry.endsAt <= now()) {
      await hangup(userId, opts.targetId);
      return { unavailable: true as const };
    }
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
    return { answer: call.answer, callId: call.callId };
  }

  // Hangs up the Learner's live call, if any, and waits until its transcript and usage are saved.
  async function hangup(userId: string, targetId?: string) {
    const entry = live.get(userId);
    if (!entry) {
      const retry = unsettled.get(userId);
      if (retry) {
        await retry();
        unsettled.delete(userId);
      }
      return;
    }
    if (targetId !== undefined && entry.targetId !== targetId) return;
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

  // Whether `callId` is the Learner's live call, so only its owner can join it.
  const owns = (userId: string, callId: string) => live.get(userId)?.callId === callId;

  return { start, hangup, voiceMinutes, shutdown, owns };
}
export type RealtimeBroker = ReturnType<typeof realtimeBroker>;

// OpenAI's SDP answer goes straight back; for Rime the browser opens the API's WebSocket to the call instead.
export const answerCall = (c: Context<AppEnv>, call: { answer?: string; callId: string }) =>
  call.answer === undefined
    ? c.json({ provider: "rime", socket: `/api/realtime/${call.callId}` }, 201)
    : c.body(call.answer, 201, { "content-type": "application/sdp" });

export const voiceMinutesRoute = (broker: RealtimeBroker) =>
  new Hono<AppEnv>().get("/", async (c) => c.json(await broker.voiceMinutes(c.var.user.id)));

export const voiceLimitMessage =
  "You've used your available voice minutes. Subscribe to Pro or add a minute pack from Profile, or use text mode.";
