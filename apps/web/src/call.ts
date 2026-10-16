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

export type CallDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  RTCPeerConnection: new () => RTCPeerConnection;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Plays the coach's audio. */
  play: (stream: MediaStream) => void;
};

const browser = (): CallDeps => ({
  getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
  RTCPeerConnection,
  fetch: (url, init) => fetch(url, init),
  play: (stream) => {
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = stream;
  },
});

export type Call = { mute(muted: boolean): void; hangUp(): void };

/** Starts a call: microphone, peer connection, SDP exchange with `url`. Every change of state goes to `onChange`. */
export function startCall(url: string, { onChange }: { onChange: (state: CallState) => void }, deps: CallDeps = browser()): Call {
  let stream: MediaStream | undefined;
  let peer: RTCPeerConnection | undefined;
  let over = false;

  const stop = (state: CallState) => {
    if (over) return;
    over = true;
    for (const track of stream?.getTracks() ?? []) track.stop();
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
      pc.ontrack = (event) => deps.play(event.streams[0]!);
      pc.onconnectionstatechange = () => {
        if (over) return;
        if (pc.connectionState === "connected") onChange({ status: "live" });
        else if (pc.connectionState === "disconnected") onChange({ status: "reconnecting" });
        else if (pc.connectionState === "failed") stop({ status: "dropped" });
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await deps.fetch(url, { method: "POST", headers: { "content-type": "application/sdp" }, body: offer.sdp });
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
  const [muted, setMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const call = useRef<Call>(undefined);
  const dropped = useRef(onDropped);
  dropped.current = onDropped;

  useEffect(() => {
    setState({ status: "connecting" });
    setMuted(false);
    const current = startCall(url, {
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
  return { ...state, muted, mute, hangUp, retry };
}
