import assert from "node:assert/strict";
import { test } from "node:test";
import { createSpeech, errorStatus, recognitionOf, speechSupported } from "../src/hooks/speech.ts";

class FakeRecognition {
  static last;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

class FakeRecorder {
  state = "inactive";
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const mic = (error) => ({
  mediaDevices: {
    getUserMedia: async () => {
      if (error) throw Object.assign(new Error("no"), { name: error });
      return { getTracks: () => [{ stop: () => mic.stopped++ }] };
    },
  },
});
mic.stopped = 0;

function win(extra = {}) {
  const urls = { made: [], revoked: [] };
  return {
    urls,
    window: {
      webkitSpeechRecognition: FakeRecognition,
      MediaRecorder: FakeRecorder,
      navigator: mic(),
      URL: {
        createObjectURL: () => (urls.made.push("blob:x"), "blob:x"),
        revokeObjectURL: (u) => urls.revoked.push(u),
      },
      ...extra,
    },
  };
}

test("support is detected from either name, and missing in browsers like Firefox", () => {
  assert.equal(speechSupported({ SpeechRecognition: FakeRecognition }), true);
  assert.equal(speechSupported({ webkitSpeechRecognition: FakeRecognition }), true);
  assert.equal(recognitionOf({ SpeechRecognition: 1, webkitSpeechRecognition: 2 }), 1);
  assert.equal(speechSupported({}), false);
  assert.equal(speechSupported(undefined), false);
});

test("an unsupported browser starts as unsupported and never listens", async () => {
  const seen = [];
  const speech = createSpeech(
    {},
    () => assert.fail("no transcript"),
    (s) => seen.push(s.status),
  );
  assert.equal(speech.state().status, "unsupported");
  await speech.start();
  assert.deepEqual(seen, ["unsupported"]);
});

test("errors map to a typed-answer fallback, except the harmless ones", () => {
  assert.equal(errorStatus("not-allowed"), "denied");
  assert.equal(errorStatus("service-not-allowed"), "denied");
  assert.equal(errorStatus("network"), "failed");
  assert.equal(errorStatus("no-speech"), undefined);
});

test("a denied microphone falls back and sends nothing", async () => {
  const { window } = win({ navigator: mic("NotAllowedError") });
  const states = [];
  const speech = createSpeech(
    window,
    () => assert.fail("no transcript"),
    (s) => states.push(s.status),
  );
  await speech.start();
  assert.equal(speech.state().status, "denied");
  assert.equal(FakeRecognition.last, undefined);
  assert.deepEqual(states, ["denied"]);
});

test("speaking shows live captions, then submits the transcript and keeps only an in-memory replay", async () => {
  const { window, urls } = win();
  const captions = [];
  let sent;
  const speech = createSpeech(
    window,
    (t) => (sent = t),
    (s) => captions.push(s.interim),
  );
  await speech.start();
  assert.equal(speech.state().status, "listening");
  const r = FakeRecognition.last;
  r.onresult({ resultIndex: 0, results: [{ isFinal: false, 0: { transcript: "I wake" } }] });
  assert.equal(speech.state().interim, "I wake");
  r.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "I wake up" } }] });
  r.onresult({ resultIndex: 1, results: [{}, { isFinal: false, 0: { transcript: "early" } }] });
  assert.equal(speech.state().interim, "I wake up early");
  speech.stop();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(sent, "I wake up");
  assert.equal(speech.state().status, "idle");
  assert.equal(speech.state().audioUrl, "blob:x");
  assert.equal(urls.made.length, 1);
  assert.ok(mic.stopped > 0, "the microphone is released");
});

test("leaving the Page mid-answer submits nothing", async () => {
  const { window } = win();
  const speech = createSpeech(
    window,
    () => assert.fail("no transcript"),
    () => {},
  );
  await speech.start();
  FakeRecognition.last.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "hello" } }] });
  speech.dispose();
  await new Promise((r) => setTimeout(r, 0));
});
