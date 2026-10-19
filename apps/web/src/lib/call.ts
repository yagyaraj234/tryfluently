import { useCallback, useEffect, useRef, useState } from "react";

// A live voice call over OpenAI Realtime (Voice Assessment, voice Roleplay). The browser sends its microphone over
// WebRTC; the API's `/:id/call` route takes the SDP offer and returns the answer, so no key ever reaches the browser
// (ADR 0001). The API keeps the transcript, so the browser only plays the coach's audio.

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
  let stopPlayback: void | (() => void);
  let conversation: ConversationState = { phase: "ready" };

  const stop = (state: CallState) => {
    if (over) return;
    over = true;
    for (const track of stream?.getTracks() ?? []) track.stop();
    channel?.close();
    stopPlayback?.();
    peer?.close();
    onChange(state);
  };

  void (async () => {
    try {
      stream = await deps.getUserMedia({ audio: true });
    } catch {
      return stop({ status: "microphone" });
    }
    if (over) return void stream.getTracks().forEach((track) => track.stop());
    try {
      peer = new deps.RTCPeerConnection();
      const pc = peer;
      for (const track of stream.getTracks()) pc.addTrack(track, stream);
      pc.ontrack = (event) => {
        if (!over) stopPlayback = deps.play(event.streams[0]!);
      };
      channel = pc.createDataChannel("oai-events");
      channel.onmessage = (message) => {
        if (over) return;
        try {
          const next = conversationEvent(conversation, JSON.parse(message.data));
          if (next !== conversation) {
            conversation = next;
            onConversation?.(next);
          }
        } catch {
          /* Ignore malformed or unrelated data-channel events. */
        }
      };
      pc.onconnectionstatechange = () => {
        if (over) return;
        if (pc.connectionState === "connected") onChange({ status: "live" });
        else if (pc.connectionState === "disconnected") onChange({ status: "reconnecting" });
        else if (pc.connectionState === "failed") stop({ status: "dropped" });
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await deps.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/sdp" },
        body: offer.sdp,
      });
      if (over) return;
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return stop({ status: "failed", response: { status: response.status, body } });
      }
      const sdp = await response.text();
      if (!over) await pc.setRemoteDescription({ type: "answer", sdp });
    } catch {
      stop({ status: "failed" });
    }
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
