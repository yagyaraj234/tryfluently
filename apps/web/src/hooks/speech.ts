import { useEffect, useRef, useState } from "react";

/**
 * Turns speech into text in the browser with SpeechRecognition (webkitSpeechRecognition in Chrome and Safari).
 * Nothing is uploaded: the audio is kept only as a MediaRecorder blob URL in memory so the Learner can replay it.
 */
export type SpeechStatus = "idle" | "listening" | "unsupported" | "denied" | "failed";
export type SpeechState = { status: SpeechStatus; interim: string; audioUrl?: string };

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/** The browser pieces a controller uses, so tests can pass a stub instead of a real window. */
export type SpeechWindow = {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
  MediaRecorder?: typeof MediaRecorder;
  navigator?: { mediaDevices?: Pick<MediaDevices, "getUserMedia"> };
  URL?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
};

/** Firefox and other browsers without speech recognition answer in text instead. */
export const recognitionOf = (win: SpeechWindow) => win.SpeechRecognition ?? win.webkitSpeechRecognition;

export const speechSupported = (win: SpeechWindow | undefined) => Boolean(win && recognitionOf(win));

/** A denied or blocked microphone gets the text answer. Other errors (no network, no speech heard) are told apart. */
export const errorStatus = (code: string): SpeechStatus | undefined =>
  code === "not-allowed" || code === "service-not-allowed"
    ? "denied"
    : code === "no-speech" || code === "aborted"
      ? undefined
      : "failed";

export function createSpeech(
  win: SpeechWindow,
  onTranscript: (text: string) => void,
  onChange: (state: SpeechState) => void,
) {
  let state: SpeechState = { status: speechSupported(win) ? "idle" : "unsupported", interim: "" };
  const set = (next: Partial<SpeechState>) => onChange((state = { ...state, ...next }));
  let recognition: Recognition | undefined;
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let chunks: Blob[] = [];
  let finalText = "";
  let cancelled = false;

  const releaseMic = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = undefined;
  };

  async function start() {
    const Recognizer = recognitionOf(win);
    if (!Recognizer) return set({ status: "unsupported" });
    if (recognition) return;
    cancelled = false;
    finalText = "";
    chunks = [];
    try {
      // Asking for the microphone first makes a denial show up as one clear error, and feeds the replay recorder.
      stream = await win.navigator?.mediaDevices?.getUserMedia({ audio: true });
    } catch (e) {
      const name = (e as { name?: string } | undefined)?.name;
      return set({ status: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed" });
    }
    if (win.MediaRecorder && stream) {
      recorder = new win.MediaRecorder(stream);
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.start();
    }
    const r = new Recognizer();
    recognition = r;
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i]!;
        if (piece.isFinal) finalText += `${piece[0].transcript} `;
        else interim += piece[0].transcript;
      }
      set({ interim: `${finalText}${interim}`.trim() });
    };
    r.onerror = (e) => {
      const status = errorStatus(e.error);
      if (status) set({ status });
    };
    r.onend = () => {
      recognition = undefined;
      releaseMic();
      const finish = () => {
        const text = finalText.trim() || state.interim.trim();
        if (!cancelled && chunks.length && win.URL)
          set({ audioUrl: win.URL.createObjectURL(new Blob(chunks, { type: chunks[0]!.type })) });
        const failed = state.status === "denied" || state.status === "failed";
        set({ interim: "", ...(failed ? {} : { status: "idle" as const }) });
        if (!cancelled && !failed && text) onTranscript(text);
      };
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = finish;
        recorder.stop();
      } else finish();
    };
    set({ status: "listening", interim: "" });
    r.start();
  }

  return {
    state: () => state,
    start,
    /** Ends listening; the transcript is sent once the recognizer reports its last words. */
    stop: () => recognition?.stop(),
    /** Leaves for good: nothing is submitted. The caller owns replay URLs (see `useSpeech`) and revokes them. */
    dispose: () => {
      cancelled = true;
      recognition?.abort();
      releaseMic();
    },
  };
}

/**
 * A controller for one Page. `onTranscript` receives the finished text. `keep` is told each replay URL so the
 * Lesson can revoke them when it is left; it can also hand back an earlier one for a Page the Learner returns to.
 */
export function useSpeech(onTranscript: (text: string) => void, keep: (url: string) => void, earlier?: string) {
  const [state, setState] = useState<SpeechState>({ status: "idle", interim: "", audioUrl: earlier });
  const control = useRef<ReturnType<typeof createSpeech>>(undefined);
  const latest = useRef({ onTranscript, keep });
  latest.current = { onTranscript, keep };
  useEffect(() => {
    const c = createSpeech(
      window as unknown as SpeechWindow,
      (t) => latest.current.onTranscript(t),
      (s) => {
        setState((old) => ({ ...s, audioUrl: s.audioUrl ?? old.audioUrl }));
        if (s.audioUrl) latest.current.keep(s.audioUrl);
      },
    );
    control.current = c;
    if (c.state().status === "unsupported") setState((s) => ({ ...s, status: "unsupported" }));
    // The player owns the replay URLs, so leaving the Page only stops listening.
    return c.dispose;
  }, []);
  return { ...state, start: () => void control.current?.start(), stop: () => control.current?.stop() };
}
