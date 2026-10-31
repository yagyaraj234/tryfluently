import { useCallback, useEffect, useRef, useState } from "react";
import type { Pcm, pcm } from "./pcm";

// A live voice call (Voice Assessment, voice Roleplay). The browser posts a WebRTC offer to the API's `/:id/call`
// route. On OpenAI the answer comes back and the microphone goes over WebRTC (ADR 0001); on Rime the API answers
// with a WebSocket to join instead, and audio streams through it as PCM (ADR 0005). No key ever reaches the
// browser. The API keeps the transcript, so the browser only plays the coach's audio.

export type CallState =
  | { status: "connecting" | "live" | "reconnecting" | "dropped" | "ended" }
  /** The microphone was denied or is missing. */
  | { status: "microphone" }
  /** The API refused the call (`response`, for example 409 already live or 429 voice-minutes cap), or the network failed. */
  | { status: "failed"; response?: { status: number; body: unknown } };

export type ConversationState = {
  phase: "ready" | "listening" | "thinking" | "speaking";
  caption?: string;
  speaker?: "coach" | "learner";
};

export function conversationEvent(current: ConversationState, event: unknown): ConversationState {
  if (!event || typeof event !== "object" || !("type" in event)) return current;
  const e = event as Record<string, unknown>;
  switch (e.type) {
    case "input_audio_buffer.speech_started":
      return { phase: "listening", speaker: "learner", caption: "" };
    case "input_audio_buffer.speech_stopped":
      return { ...current, phase: "thinking" };
    case "output_audio_buffer.started":
      return { phase: "speaking", speaker: "coach", caption: current.speaker === "coach" ? current.caption : "" };
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      return current.phase === "speaking" ? { ...current, phase: "ready" } : current;
    case "response.output_audio_transcript.delta":
      return typeof e.delta === "string"
        ? {
            ...current,
            speaker: "coach",
            caption: ((current.speaker === "coach" ? (current.caption ?? "") : "") + e.delta).slice(-2000),
          }
        : current;
    case "response.output_audio_transcript.done":
      return typeof e.transcript === "string"
        ? { ...current, speaker: "coach", caption: e.transcript.slice(-2000) }
        : current;
    case "conversation.item.input_audio_transcription.completed":
      // A delayed Learner transcript must not replace the coach's current captions.
      return current.speaker !== "coach" && typeof e.transcript === "string"
        ? { ...current, speaker: "learner", caption: e.transcript.slice(-2000) }
        : current;
    default:
      return current;
  }
}

export type CallDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  RTCPeerConnection: new () => RTCPeerConnection;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Plays the coach's audio. */
  play: (stream: MediaStream) => void | (() => void);
  /** Opens the API's WebSocket for a Rime call. */
  socket: (path: string) => WebSocket;
  pcm: typeof pcm;
};

const browser = (): CallDeps => ({
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  RTCPeerConnection,
  fetch: (url, init) => fetch(url, init),
  play: (stream) => {
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  },
  socket: (path) => {
    const url = new URL(path, location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return new WebSocket(url);
  },
  // Loaded on a Rime call only.
  pcm: (...args) => import("./pcm").then((m) => m.pcm(...args)),
});

export type Call = { mute(muted: boolean): void; hangUp(): void };

/** Starts a call: microphone, peer connection, SDP exchange with `url`. Every change of state goes to `onChange`. */
export function startCall(
  url: string,
  {
    onChange,
    onConversation,
  }: { onChange: (state: CallState) => void; onConversation?: (state: ConversationState) => void },
  deps: CallDeps = browser(),
): Call {
  let stream: MediaStream | undefined;
  let peer: RTCPeerConnection | undefined;
  let over = false;
  let channel: RTCDataChannel | undefined;
  let socket: WebSocket | undefined;
  let audio: Pcm | undefined;
  let stopPlayback: void | (() => void);
  let conversation: ConversationState = { phase: "ready" };
  // Which connection is current, the provider the API put it on, and whether a drop was already resumed (ADR 0005).
  let attempt = 0;
  let provider: "openai" | "rime" | undefined;
  let resumed = false;

  // Lets go of the connection, but not the microphone.
  const release = () => {
    attempt++;
    channel?.close();
    socket?.close();
    audio?.close();
    stopPlayback?.();
    peer?.close();
    channel = socket = audio = stopPlayback = peer = undefined;
  };

  const stop = (state: CallState) => {
    if (over) return;
    over = true;
    for (const track of stream?.getTracks() ?? []) track.stop();
    release();
    onChange(state);
  };

  const show = (event: unknown) => {
    if (over) return;
    const next = conversationEvent(conversation, event);
    if (next !== conversation) {
      conversation = next;
      onConversation?.(next);
    }
  };

  // A dropped call reconnects once, on the other provider; the API carries the conversation over.
  const dropped = () => {
    if (over) return;
    if (resumed || !provider) return stop({ status: "dropped" });
    resumed = true;
    release();
    onChange({ status: "reconnecting" });
    void connect(`${url}?after=${provider}`);
  };

  // Rime: the coach's audio arrives as PCM chunks, so the browser plays it and tells Prism what was heard.
  const joinRime = async (path: string, mic: MediaStream, current: () => boolean) => {
    const ws = (socket = deps.socket(path));
    const send = (event: object) => ws.readyState === 1 && ws.send(JSON.stringify(event));
    let speaking: string | undefined;
    let drain: string | undefined;
    const drained = () => {
      if (drain) send({ type: "prism.playback.drained", drain_token: drain });
      drain = undefined;
    };
    // A socket that never opens (a proxy or network fault) closes too, so it resumes away from Rime like a drop.
    ws.onclose = () => current() && dropped();
    await new Promise((resolve) => (ws.onopen = resolve));
    const sound = await deps.pcm(
      mic,
      (chunk) => send({ type: "input_audio_buffer.append", audio: chunk }),
      () => {
        speaking = undefined;
        show({ type: "output_audio_buffer.stopped" });
        drained();
      },
    );
    if (!current()) return sound.close();
    audio = sound;
    stopPlayback = deps.play(sound.output);
    onChange({ status: "live" });
    send({ type: "response.create" });
    ws.onmessage = (message) => {
      let e: Record<string, any>;
      try {
        e = JSON.parse(message.data);
      } catch {
        return;
      }
      if (e.type === "response.audio.delta") {
        if (!speaking) show({ type: "output_audio_buffer.started" });
        speaking = e.item_id;
        return sound.play(e.delta);
      }
      if (e.type === "response.done") {
        drain = e.response?.metadata?.prism_drain_token;
        if (!speaking) drained();
      }
      show(e);
      if (e.type === "input_audio_buffer.speech_started" && speaking) {
        // The Learner talked over the coach: stop, and tell Prism how much of the reply they heard.
        send({ type: "conversation.item.truncate", item_id: speaking, content_index: 0, audio_end_ms: sound.stop() });
        speaking = undefined;
        show({ type: "output_audio_buffer.cleared" });
        drained();
      }
    };
  };

  // Posts a WebRTC offer to `target`. OpenAI answers it; Rime answers with a WebSocket to join instead.
  const connect = async (target: string) => {
    const mine = attempt;
    const current = () => !over && mine === attempt;
    // A refused or failed resume ends the call as dropped, as the first drop would have without it.
    const failed = (response?: { status: number; body: unknown }) =>
      current() && stop(target === url ? { status: "failed", ...(response && { response }) } : { status: "dropped" });
    const mic = stream!;
    try {
      const pc = (peer = new deps.RTCPeerConnection());
      for (const track of mic.getTracks()) pc.addTrack(track, mic);
      pc.ontrack = (event) => {
        if (current()) stopPlayback = deps.play(event.streams[0]!);
      };
      const events = (channel = pc.createDataChannel("oai-events"));
      // The coach always speaks first: it opens a new call, and picks a resumed one up where it dropped.
      events.onopen = () => current() && events.send(JSON.stringify({ type: "response.create" }));
      channel.onmessage = (message) => {
        try {
          if (current()) show(JSON.parse(message.data));
        } catch {
          /* Ignore malformed or unrelated data-channel events. */
        }
      };
      pc.onconnectionstatechange = () => {
        if (!current()) return;
        if (pc.connectionState === "connected") onChange({ status: "live" });
        else if (pc.connectionState === "disconnected") onChange({ status: "reconnecting" });
        else if (pc.connectionState === "failed") dropped();
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await deps.fetch(target, {
        method: "POST",
        headers: { "content-type": "application/sdp" },
        body: offer.sdp,
      });
      if (!current()) return;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return failed({ status: response.status, body });
      }
      if (response.headers.get("content-type")?.includes("application/json")) {
        provider = "rime";
        const { socket: path } = (await response.json()) as { socket: string };
        pc.close();
        return await joinRime(path, mic, current);
      }
      provider = "openai";
      const sdp = await response.text();
      if (current()) await pc.setRemoteDescription({ type: "answer", sdp });
    } catch {
      failed();
    }
  };

  void (async () => {
    try {
      stream = await deps.getUserMedia({ audio: true });
    } catch {
      return stop({ status: "microphone" });
    }
    if (over) return void stream.getTracks().forEach((track) => track.stop());
    await connect(url);
  })();

  return {
    mute(muted) {
      for (const track of stream?.getTracks() ?? []) track.enabled = !muted;
    },
    hangUp: () => stop({ status: "ended" }),
  };
}

/**
 * A live call for as long as the component is mounted (or until `hangUp`). `retry` starts a fresh one, for example
 * after the microphone was allowed. `onDropped` fires when the connection is lost without anyone hanging up.
 */
export function useRealtimeCall(url: string, { onDropped }: { onDropped?: () => void } = {}) {
  const [state, setState] = useState<CallState>({ status: "connecting" });
  const [conversation, setConversation] = useState<ConversationState>({ phase: "ready" });
  const [muted, setMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const call = useRef<Call>(undefined);
  const dropped = useRef(onDropped);
  dropped.current = onDropped;

  useEffect(() => {
    setState({ status: "connecting" });
    setMuted(false);
    setConversation({ phase: "ready" });
    const current = startCall(url, {
      onConversation: setConversation,
      onChange: (next) => {
        setState(next);
        if (next.status === "dropped") dropped.current?.();
      },
    });
    call.current = current;
    return () => current.hangUp();
  }, [url, attempt]);

  const mute = useCallback((next: boolean) => {
    call.current?.mute(next);
    setMuted(next);
  }, []);
  const hangUp = useCallback(() => call.current?.hangUp(), []);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, conversation, muted, mute, hangUp, retry };
}
