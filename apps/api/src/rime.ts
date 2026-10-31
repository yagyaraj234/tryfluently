import { pick, type BrowserSocket, type Realtime, type RealtimeEvent } from "./realtime";

// Rime Prism, a speech-to-speech service (ADR 0005). Its key stays here, so the browser can't reach Prism directly:
// it streams microphone audio over the API's WebSocket, and this relays it both ways. English only, us-east-2 only.
const PRISM = "wss://prism.api.rime.ai/v1/realtime";
const voices = ["astra", "aurora", "brando", "wawona"];

// What the browser needs to play the coach and show captions; everything else stays on the server.
const toBrowser = new Set([
  "response.audio.delta",
  "response.output_audio_transcript.delta",
  "response.output_audio_transcript.done",
  "input_audio_buffer.speech_started",
  "input_audio_buffer.speech_stopped",
  "conversation.item.input_audio_transcription.completed",
  "response.done",
]);
const fromBrowser = new Set(["input_audio_buffer.append", "conversation.item.truncate", "prism.playback.drained"]);
// The browser's response.create becomes this, once per call: the coach opens the conversation. Prism's nudge
// says nothing without an instruction; the brief says how to open.
const opening = JSON.stringify({
  type: "response.create",
  response: {
    prism_instruction: "Open the call now, as your instructions say.",
    metadata: { prism_cause: "proactive" },
  },
});

// Prism names the coach's words as text events; the broker and browser use OpenAI's audio-transcript names.
const rename = (e: RealtimeEvent): RealtimeEvent =>
  e.type === "response.text.delta"
    ? { ...e, type: "response.output_audio_transcript.delta" }
    : e.type === "response.text.done"
      ? { ...e, type: "response.output_audio_transcript.done", transcript: e.text }
      : e;

type Call = {
  ws: WebSocket;
  voice: string;
  // Events for the browser that arrive before it joins.
  waiting: string[];
  browser?: BrowserSocket;
  // Prism's drain token for each response, so the browser's "done playing" becomes the broker's audio-stopped event.
  drains: Map<string, string>;
  onEvent?: (e: RealtimeEvent) => void | Promise<void>;
  onClose?: (failed?: boolean) => void | Promise<void>;
  // Closed by us (hangup) or by the browser leaving: not a provider failure.
  ended?: "hangup" | "left";
  // Prism takes a nudge only while idle, and says so once, when it becomes idle.
  idle?: boolean;
  opening?: "wanted" | "sent";
};

export const rimeRealtime = (apiKey: string, { setupMs = 5_000 } = {}): Realtime => {
  // shortcut: calls live in memory, like the broker's; one API instance only.
  const calls = new Map<string, Call>();

  const emit = (call: Call, e: RealtimeEvent) =>
    void Promise.resolve(call.onEvent?.(e)).catch((error) => console.error("realtime event failed", error));

  const open = (call: Call) => {
    call.opening = "sent";
    call.ws.send(opening);
  };

  const forward = (call: Call, e: RealtimeEvent) => {
    if (!toBrowser.has(e.type)) return;
    const data = JSON.stringify(
      e.type === "response.done"
        ? { type: e.type, response: { id: e.response?.id, metadata: e.response?.metadata } }
        : e,
    );
    if (call.browser) call.browser.send(data);
    else call.waiting.push(data);
  };

  return {
    async createCall(_sdp, session, _avoid, voiceKey) {
      // Bun's WebSocket takes headers, which browsers' doesn't.
      const ws = new WebSocket(PRISM, { headers: { authorization: `Bearer ${apiKey}` } } as any);
      const callId = `rime_${crypto.randomUUID()}`;
      const call: Call = { ws, voice: pick(voices, voiceKey), waiting: [], drains: new Map() };
      await new Promise<void>((resolve, reject) => {
        const fail = (why: string) => {
          clearTimeout(timer);
          ws.onclose = null;
          ws.close();
          reject(new Error(`Rime Prism ${why}`));
        };
        const timer = setTimeout(() => fail("setup timed out"), setupMs);
        ws.onopen = () =>
          ws.send(
            JSON.stringify({
              type: "session.update",
              session: { voice: call.voice, tools: session.tools ?? [], prism_client_caps: ["playback_drained"] },
            }),
          );
        ws.onclose = (c) => fail(`closed ${c.code} during setup`);
        ws.onmessage = (m) => {
          const e = JSON.parse(String(m.data));
          if (e.type === "error") return fail(`setup error ${e.error?.code}`);
          if (e.type !== "session.updated") return;
          clearTimeout(timer);
          resolve();
        };
      });
      ws.onmessage = (m) => {
        const e = rename(JSON.parse(String(m.data)));
        if (e.type === "error") console.error("Rime Prism error", e.error);
        if (e.type === "prism.typed_input.ready") call.idle = true;
        else if (e.type === "response.created" || e.type === "input_audio_buffer.speech_started") call.idle = false;
        if (call.idle && call.opening === "wanted") open(call);
        const token = e.type === "response.done" && e.response?.metadata?.prism_drain_token;
        if (token) call.drains.set(token, e.response.id);
        forward(call, e);
        emit(call, e);
      };
      ws.onclose = (c) => {
        calls.delete(callId);
        if (call.ended === "hangup") return;
        // 1000 is Prism's idle timeout, or the browser leaving; 1001 (draining) and 1011 (VAD failure) are failures.
        void Promise.resolve(call.onClose?.(!call.ended && c.code !== 1000)).catch((error) =>
          console.error("realtime close failed", error),
        );
      };
      calls.set(callId, call);
      return { callId, provider: "rime" };
    },

    attach(callId, { onEvent, onClose }) {
      const call = calls.get(callId)!;
      Object.assign(call, { onEvent, onClose });
      return {
        send(event: RealtimeEvent) {
          // Prism wants the voice on every session update and has no session type.
          const { type: _, ...session } = event.session ?? {};
          const out =
            event.type === "session.update" ? { ...event, session: { ...session, voice: call.voice } } : event;
          if (call.ws.readyState === WebSocket.OPEN) call.ws.send(JSON.stringify(out));
        },
        async hangup() {
          call.ended = "hangup";
          calls.delete(callId);
          call.ws.close(1000);
          call.browser?.close(1000);
        },
      };
    },

    join(callId, browser) {
      const call = calls.get(callId);
      if (!call || call.browser) return;
      call.browser = browser;
      for (const data of call.waiting.splice(0)) browser.send(data);
      return {
        message(data) {
          let e: RealtimeEvent;
          try {
            e = JSON.parse(data);
          } catch {
            return;
          }
          if (call.ws.readyState !== WebSocket.OPEN) return;
          if (e?.type === "response.create") {
            if (call.opening) return;
            call.opening = "wanted";
            if (call.idle) open(call);
            return;
          }
          if (!fromBrowser.has(e?.type)) return;
          call.ws.send(data);
          const responseId = e.type === "prism.playback.drained" && call.drains.get(e.drain_token);
          if (responseId) {
            call.drains.delete(e.drain_token);
            emit(call, { type: "output_audio_buffer.stopped", response_id: responseId });
          }
        },
        close() {
          if (call.ended) return;
          call.ended = "left";
          call.ws.close(1000);
        },
      };
    },
  };
};
