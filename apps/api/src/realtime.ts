import { schema } from "@impromptu/db";
import type { UIMessage } from "ai";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Deps, Schedule } from "./app";
import { localDay } from "./progress";

export type RealtimeEvent = { type: string; [key: string]: any };
export type RealtimeSession = Record<string, unknown>;
export type Sideband = { send(event: object): void; hangup(): Promise<void> };

// Thin client over OpenAI Realtime, faked in tests.
export type Realtime = {
  // Posts the browser's SDP offer with the owner's key; the answer goes back to the browser, the call id stays here.
  createCall(sdp: string, session: RealtimeSession): Promise<{ answer: string; callId: string }>;
  // Opens the server's sideband connection to a live call.
  attach(callId: string, handlers: { onEvent(e: RealtimeEvent): void; onClose(): void | Promise<void> }): Sideband;
};

const API = "https://api.openai.com/v1/realtime";

export const openaiRealtime = (apiKey: string): Realtime => {
  const authorization = `Bearer ${apiKey}`;
  return {
    async createCall(sdp, session) {
      const body = new FormData();
      body.set("sdp", sdp);
      body.set("session", JSON.stringify(session));
      const res = await fetch(`${API}/calls`, { method: "POST", headers: { authorization }, body });
      if (!res.ok) throw new Error(`OpenAI Realtime ${res.status}: ${await res.text()}`);
      const callId = res.headers.get("location")?.split("/").pop();
      if (!callId) throw new Error("OpenAI Realtime returned no call id");
      return { answer: await res.text(), callId };
    },
    attach(callId, { onEvent, onClose }) {
      // Bun's WebSocket takes headers, which browsers' doesn't.
      const ws = new WebSocket(`${API}?call_id=${callId}`, { headers: { authorization } } as any);
      ws.onmessage = (m) => onEvent(JSON.parse(String(m.data)));
      ws.onclose = () => void onClose();
      const send = (event: object) =>
        ws.readyState === WebSocket.OPEN
          ? ws.send(JSON.stringify(event))
          : ws.addEventListener("open", () => ws.send(JSON.stringify(event)), { once: true });
      return {
        send,
        async hangup() {
          await fetch(`${API}/calls/${callId}/hangup`, { method: "POST", headers: { authorization } });
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

export type CallPurpose = "assessment" | "roleplay";

// Starts and tracks Realtime calls: one live call per Learner, transcripts and voice timing collected from the
// sideband, and an ai_usage row written when the call closes. No audio is kept.
const WRAP_UP_SECONDS = 60;
const wrapUp = "\n\nAbout a minute is left. Start to wrap up now: ask no new questions, and close the conversation politely.";

type Live = { sideband?: Sideband; closed: Promise<void>; purpose: CallPurpose; startedAt?: Date };

export function realtimeBroker({ db, now, realtime, schedule }: Pick<Deps, "db" | "now" | "realtime"> & { schedule: Schedule }) {
  // ponytail: live calls are held in memory, so "one call per Learner" holds on a single API instance; move it to a DB lock to scale out.
  const live = new Map<string, Live>();

  // Seconds of Roleplay calls today in the Learner's timezone, a live one included. Voice Assessments don't count.
  async function roleplaySecondsToday(user: { id: string; timezone: string }) {
    const at = now();
    const rows = await db
      .select({ startedAt: schema.aiUsage.startedAt, seconds: schema.aiUsage.seconds })
      .from(schema.aiUsage)
      .where(
        and(
          eq(schema.aiUsage.userId, user.id),
          eq(schema.aiUsage.kind, "realtime"),
          sql`${schema.aiUsage.usage}->>'purpose' = 'roleplay'`,
          gte(schema.aiUsage.startedAt, new Date(at.getTime() - 2 * 86_400_000)),
        ),
      );
    const call = live.get(user.id);
    if (call?.purpose === "roleplay" && call.startedAt)
      rows.push({ startedAt: call.startedAt, seconds: (at.getTime() - call.startedAt.getTime()) / 1000 });
    const today = localDay(at, user.timezone);
    return rows.filter((r) => localDay(r.startedAt, user.timezone) === today).reduce((sum, r) => sum + r.seconds, 0);
  }

  // `budgetSeconds` caps the call: the agent is told to wrap up a minute before, then the call is hung up.
  async function start(
    userId: string,
    opts: {
      sdp: string;
      instructions: string;
      purpose: CallPurpose;
      budgetSeconds?: number;
      onTranscript(t: UIMessage[]): Promise<unknown>;
    },
  ) {
    if (live.has(userId)) return { busy: true as const };
    let closed!: () => void;
    const entry: Live = { closed: new Promise((r) => (closed = r)), purpose: opts.purpose };
    live.set(userId, entry); // claimed before the network call, so two quick requests can't both start one

    let call: { answer: string; callId: string };
    try {
      call = await realtime.createCall(opts.sdp, sessionConfig);
    } catch (e) {
      live.delete(userId);
      closed();
      throw e;
    }

    const startedAt = now();
    entry.startedAt = startedAt;
    const timers: (() => void)[] = [];
    const transcript: UIMessage[] = [];
    const timing = new Map<string, { speechStartMs?: number; speechEndMs?: number }>();
    const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    let saving: Promise<unknown> = Promise.resolve();
    let ended = false;

    const add = (message: UIMessage) => {
      transcript.push(message);
      saving = saving.then(() => opts.onTranscript([...transcript]));
    };

    entry.sideband = realtime.attach(call.callId, {
      onEvent(e) {
        if (e.type === "input_audio_buffer.speech_started") timing.set(e.item_id, { speechStartMs: e.audio_start_ms });
        else if (e.type === "input_audio_buffer.speech_stopped") timing.set(e.item_id, { ...timing.get(e.item_id), speechEndMs: e.audio_end_ms });
        else if (e.type === "conversation.item.input_audio_transcription.completed") {
          const t = timing.get(e.item_id);
          add({ id: e.item_id, role: "user", parts: [{ type: "text", text: e.transcript }], ...(t && { metadata: t }) });
        } else if (e.type === "response.output_audio_transcript.done")
          add({ id: e.item_id, role: "assistant", parts: [{ type: "text", text: e.transcript }] });
        else if (e.type === "response.done" && e.response?.usage) {
          const u = e.response.usage;
          usage.inputTokens += u.input_tokens ?? 0;
          usage.cachedInputTokens += u.input_token_details?.cached_tokens ?? 0;
          usage.outputTokens += u.output_tokens ?? 0;
        }
      },
      async onClose() {
        if (ended) return; // hangup and the socket closing both land here
        ended = true;
        for (const cancel of timers) cancel();
        await saving;
        await db.insert(schema.aiUsage).values({
          userId,
          kind: "realtime",
          callId: call.callId,
          startedAt,
          seconds: (now().getTime() - startedAt.getTime()) / 1000,
          usage: { ...usage, purpose: opts.purpose },
        });
        live.delete(userId);
        closed();
      },
    });
    entry.sideband.send({ type: "session.update", session: { type: "realtime", instructions: opts.instructions } });
    if (opts.budgetSeconds !== undefined) {
      const sideband = entry.sideband;
      timers.push(
        schedule(Math.max(0, opts.budgetSeconds - WRAP_UP_SECONDS) * 1000, () =>
          sideband.send({ type: "session.update", session: { type: "realtime", instructions: opts.instructions + wrapUp } }),
        ),
        schedule(opts.budgetSeconds * 1000, () => hangup(userId)),
      );
    }
    return { answer: call.answer };
  }

  // Hangs up the Learner's live call, if any, and waits until its transcript and usage are saved.
  async function hangup(userId: string) {
    const entry = live.get(userId);
    if (!entry) return;
    await entry.sideband?.hangup();
    await entry.closed;
  }

  return { start, hangup, roleplaySecondsToday };
}
export type RealtimeBroker = ReturnType<typeof realtimeBroker>;

// The day's Roleplay voice budget for a free Learner.
export async function voiceMinutes(broker: RealtimeBroker, user: { id: string; timezone: string }, limitMinutes: number) {
  const used = await broker.roleplaySecondsToday(user);
  return { limitMinutes, usedSeconds: Math.round(used), remainingSeconds: Math.max(0, Math.round(limitMinutes * 60 - used)) };
}
