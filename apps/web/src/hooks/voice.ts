import type { RecordingState } from "@impromptu/ui";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** A recorded answer, transcribed by the API. Answer the Step with `{ recordingId }`. */
export type Recorded = { recordingId: string; text: string };

export type RecorderState = RecordingState | ({ status: "done" } & Recorded);

/** The browser APIs a recorder uses, swappable for fakes in tests. */
export type RecorderMedia = {
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  MediaRecorder?: typeof MediaRecorder;
  AudioContext?: typeof AudioContext;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  now: () => number;
};

const browser = (): RecorderMedia => ({
  mediaDevices: globalThis.navigator?.mediaDevices,
  MediaRecorder: globalThis.MediaRecorder,
  AudioContext: globalThis.AudioContext,
  fetch: (input, init) => globalThis.fetch(input, init),
  now: () => performance.now(),
});

/** The API takes recordings of up to 180 seconds, so a recording stops itself there. */
export const MAX_SECONDS = 180;
const TICK_MS = 100;

/**
 * Records an answer from the microphone, uploads it to `url` (multipart `audio` and `seconds`) and calls
 * `onRecorded` with the transcript. A 429 means today's recorded minutes are used up; that, and a microphone
 * that's missing or not allowed, leave the recorder `unavailable` so the Learner answers in text.
 */
export function createRecorder(
  url: string,
  onRecorded: (recorded: Recorded) => void,
  media: RecorderMedia = browser(),
) {
  let state: RecorderState = { status: "idle" };
  const listeners = new Set<() => void>();
  const set = (next: RecorderState) => {
    state = next;
    for (const listener of listeners) listener();
  };

  let session: { recorder: MediaRecorder; release: () => void } | undefined;
  let last: { audio: Blob; seconds: number } | undefined;

  async function start() {
    if (session || state.status === "processing" || state.status === "unavailable") return;
    const { mediaDevices, MediaRecorder: Recorder, AudioContext: Context, now } = media;
    if (!mediaDevices?.getUserMedia || !Recorder) return set({ status: "unavailable", reason: "unsupported" });

    let stream: MediaStream;
    try {
      stream = await mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as { name?: string } | undefined)?.name;
      return set({
        status: "unavailable",
        reason: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "no-microphone",
      });
    }

    const recorder = new Recorder(
      stream,
      Recorder.isTypeSupported("audio/webm") ? { mimeType: "audio/webm" } : undefined,
    );
    const chunks: Blob[] = [];
    const startedAt = now();
    const seconds = () => (now() - startedAt) / 1000;

    // The input level, from an analyser on the microphone, as 0 to 1.
    const context = Context ? new Context() : undefined;
    const analyser = context?.createAnalyser();
    if (context && analyser) {
      context.createMediaStreamSource(stream).connect(analyser);
      // A context made after the await of getUserMedia can start suspended.
      void context.resume?.();
    }
    const samples = new Float32Array(analyser?.fftSize ?? 0);
    const level = () => {
      if (!analyser) return 0;
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);
      return Math.min(1, rms * 4);
    };

    const timer = setInterval(() => {
      if (seconds() >= MAX_SECONDS) return stop();
      set({ status: "recording", seconds: seconds(), level: level() });
    }, TICK_MS);
    const release = () => {
      clearInterval(timer);
      for (const track of stream.getTracks()) track.stop();
      void context?.close();
    };

    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      // Rounded to a tenth, and never zero: the API wants a positive length.
      last = {
        audio: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }),
        seconds: Math.max(0.1, Math.round(seconds() * 10) / 10),
      };
      void upload();
    };
    session = { recorder, release };
    recorder.start();
    set({ status: "recording", seconds: 0, level: 0 });
  }

  // Ends the recording: the microphone is released, and unless it's discarded, what was recorded is uploaded.
  function end(discard = false) {
    if (!session) return;
    const { recorder, release } = session;
    session = undefined;
    release();
    if (discard) recorder.onstop = null;
    if (recorder.state !== "inactive") recorder.stop();
  }
  const stop = () => end();

  async function upload() {
    if (!last) return;
    set({ status: "processing" });
    const form = new FormData();
    const extensions: Record<string, string> = {
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
    };
    const extension = extensions[last.audio.type.split(";")[0]!] ?? "webm";
    form.append("audio", last.audio, `answer.${extension}`);
    form.append("seconds", String(last.seconds));
    let response: Response;
    try {
      response = await media.fetch(url, { method: "POST", body: form });
    } catch {
      return set({ status: "failed", reason: "failed" });
    }
    if (response.status === 429) return set({ status: "unavailable", reason: "capped" });
    if (!response.ok) return set({ status: "failed", reason: "failed" });
    const { recordingId, text } = (await response.json()) as Recorded;
    if (!text.trim()) return set({ status: "failed", reason: "silent" });
    last = undefined;
    set({ status: "done", recordingId, text });
    onRecorded({ recordingId, text });
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start,
    stop,
    /** Uploads the last recording again, after a failed upload. */
    retry() {
      if (state.status === "failed" && state.reason === "failed") void upload();
    },
    /** Back to idle for the next Step. A recorder that's unavailable stays so. */
    reset() {
      if (state.status === "done" || state.status === "failed") set({ status: "idle" });
    },
    /** Releases the microphone without uploading. */
    dispose() {
      if (!session) return;
      end(true);
      set({ status: "idle" });
    },
  };
}

const idle: RecorderState = { status: "idle" };

/**
 * A recorder for one screen (a Lesson keeps one across its Steps, so a cap or a denied microphone sticks).
 * The microphone is released when the screen unmounts. Server rendering always sees it idle.
 */
export function useRecorder(url: string, onRecorded: (recorded: Recorded) => void) {
  const latest = useRef(onRecorded);
  useEffect(() => {
    latest.current = onRecorded;
  });
  const [recorder] = useState(() => createRecorder(url, (r) => latest.current(r)));
  useEffect(() => () => recorder.dispose(), [recorder]);
  const state = useSyncExternalStore(recorder.subscribe, recorder.getState, () => idle);
  return { state, start: recorder.start, stop: recorder.stop, retry: recorder.retry, reset: recorder.reset };
}

/** The Reference Pronunciation of a word or phrase. The API takes up to 200 characters. */
export const pronunciationUrl = (text: string) => `/api/pronunciation?${new URLSearchParams({ text })}`;
export const canHear = (text: string) => text.trim().length > 0 && text.trim().length <= 200;

let playing: HTMLAudioElement | undefined;

/** Plays the Reference Pronunciation of `text`, stopping any that's still playing. Rejects if it can't play. */
export function hearIt(text: string) {
  playing?.pause();
  playing = new Audio(pronunciationUrl(text.trim()));
  return playing.play();
}
