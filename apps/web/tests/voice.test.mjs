import assert from "node:assert/strict";
import { test } from "node:test";
import { createRecorder } from "../src/hooks/voice.ts";

// A fake microphone, MediaRecorder and clock. Stopping the recorder emits one webm chunk.
function fakeMedia({ getUserMedia, mimeType = "audio/webm" } = {}) {
  const tracks = [];
  const recorders = [];
  let time = 1_000;
  class FakeMediaRecorder {
    static isTypeSupported = (type) => type === mimeType;
    constructor(stream, options) {
      this.mimeType = options?.mimeType ?? mimeType;
      recorders.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  const media = {
    mediaDevices: {
      getUserMedia:
        getUserMedia ??
        (async (constraints) => {
          assert.deepEqual(constraints, { audio: true });
          const track = { stopped: false, stop: () => (track.stopped = true) };
          tracks.push(track);
          return { getTracks: () => [track] };
        }),
    },
    MediaRecorder: FakeMediaRecorder,
    now: () => time,
  };
  return { media, tracks, recorders, advance: (ms) => (time += ms) };
}

// A fake API: each upload gets the next reply.
function fakeApi(...replies) {
  const sent = [];
  const fetch = async (url, init) => {
    sent.push({ url, method: init.method, form: init.body });
    const [status, body] = replies.shift();
    if (status === "offline") throw new TypeError("Failed to fetch");
    return Response.json(body, { status });
  };
  return { sent, fetch };
}

const until = async (check) => {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5));
  assert.ok(check());
};

const transcribed = {
  recordingId: "r1",
  text: "I lead a team of five.",
  timing: { seconds: 12.5, words: 6, wpm: 28.8 },
};

test("records webm from the microphone, uploads it with its length and hands back the recording", async () => {
  const { media, tracks, recorders, advance } = fakeMedia();
  const api = fakeApi([201, transcribed]);
  const recorded = [];
  const recorder = createRecorder("/api/lessons/7/recordings", (r) => recorded.push(r), { ...media, fetch: api.fetch });

  await recorder.start();
  assert.equal(recorder.getState().status, "recording");
  assert.equal(recorders[0].mimeType, "audio/webm");
  advance(12_500);
  recorder.stop();
  await until(() => recorder.getState().status === "done");

  assert.equal(api.sent.length, 1);
  assert.equal(api.sent[0].url, "/api/lessons/7/recordings");
  assert.equal(api.sent[0].method, "POST");
  const audio = api.sent[0].form.get("audio");
  assert.equal(audio.type, "audio/webm");
  assert.equal(await audio.text(), "voice");
  assert.equal(api.sent[0].form.get("seconds"), "12.5");
  assert.deepEqual(recorded, [{ recordingId: "r1", text: "I lead a team of five." }]);
  assert.deepEqual(recorder.getState(), { status: "done", recordingId: "r1", text: "I lead a team of five." });
  assert.ok(tracks[0].stopped, "the microphone is released");
});

test("while recording, it reports the seconds so far and the input level", async () => {
  const { media, advance } = fakeMedia();
  // A steady signal at 0.1 reads as a level of 0.4.
  class FakeAudioContext {
    createAnalyser = () => ({ fftSize: 4, getFloatTimeDomainData: (samples) => samples.fill(0.1) });
    createMediaStreamSource = () => ({ connect: () => {} });
    close = async () => {};
  }
  const recorder = createRecorder("/r", () => {}, { ...media, AudioContext: FakeAudioContext, fetch: fakeApi().fetch });
  await recorder.start();
  assert.deepEqual(recorder.getState(), { status: "recording", seconds: 0, level: 0 });
  advance(4_000);
  await until(() => recorder.getState().seconds === 4);
  assert.ok(Math.abs(recorder.getState().level - 0.4) < 1e-6);
  recorder.dispose();
});

test("a recording stops itself at the API's 180-second limit", async () => {
  const { media, advance } = fakeMedia();
  const api = fakeApi([201, transcribed]);
  const recorder = createRecorder("/r", () => {}, { ...media, fetch: api.fetch });
  await recorder.start();
  advance(180_000);
  await until(() => recorder.getState().status === "done");
  assert.equal(api.sent[0].form.get("seconds"), "180");
});

for (const [name, reason] of [
  ["NotAllowedError", "denied"],
  ["NotFoundError", "no-microphone"],
]) {
  test(`a microphone that fails with ${name} leaves the recorder unavailable (${reason})`, async () => {
    const getUserMedia = async () => {
      throw new DOMException("no", name);
    };
    const { media } = fakeMedia({ getUserMedia });
    const recorder = createRecorder("/r", () => {}, { ...media, fetch: fakeApi().fetch });
    await recorder.start();
    assert.deepEqual(recorder.getState(), { status: "unavailable", reason });
  });
}

test("a browser that can't record is unavailable too", async () => {
  const recorder = createRecorder("/r", () => {}, { fetch: fakeApi().fetch, now: () => 0 });
  await recorder.start();
  assert.deepEqual(recorder.getState(), { status: "unavailable", reason: "unsupported" });
});

test("at today's recorded-minutes cap (429) the recorder is unavailable for the rest of the Lesson", async () => {
  const { media } = fakeMedia();
  const recorded = [];
  const recorder = createRecorder("/r", (r) => recorded.push(r), {
    ...media,
    fetch: fakeApi([429, { error: "cap" }]).fetch,
  });
  await recorder.start();
  recorder.stop();
  await until(() => recorder.getState().status === "unavailable");
  assert.deepEqual(recorder.getState(), { status: "unavailable", reason: "capped" });
  recorder.reset();
  await recorder.start();
  assert.equal(recorder.getState().status, "unavailable", "it doesn't record again");
  assert.deepEqual(recorded, []);
});

test("a failed transcription (502) can be retried with the same recording", async () => {
  const { media, advance } = fakeMedia();
  const api = fakeApi(
    [502, { error: "The recording couldn't be transcribed. Try again." }],
    ["offline"],
    [201, transcribed],
  );
  const recorded = [];
  const recorder = createRecorder("/r", (r) => recorded.push(r), { ...media, fetch: api.fetch });
  await recorder.start();
  advance(3_000);
  recorder.stop();
  await until(() => recorder.getState().status === "failed");
  assert.deepEqual(recorder.getState(), { status: "failed", reason: "failed" });

  recorder.retry();
  await until(() => api.sent.length === 2 && recorder.getState().status === "failed");
  recorder.retry();
  await until(() => recorder.getState().status === "done");
  assert.equal(api.sent.length, 3);
  assert.equal(api.sent[2].form.get("seconds"), "3");
  assert.equal(await api.sent[2].form.get("audio").text(), "voice");
  assert.deepEqual(recorded, [{ recordingId: "r1", text: "I lead a team of five." }]);
});

test("a recording with nothing to hear asks the Learner to record again", async () => {
  const { media } = fakeMedia();
  const recorded = [];
  const recorder = createRecorder("/r", (r) => recorded.push(r), {
    ...media,
    fetch: fakeApi([201, { ...transcribed, text: " " }]).fetch,
  });
  await recorder.start();
  recorder.stop();
  await until(() => recorder.getState().status === "failed");
  assert.deepEqual(recorder.getState(), { status: "failed", reason: "silent" });
  assert.deepEqual(recorded, []);
  recorder.reset();
  assert.deepEqual(recorder.getState(), { status: "idle" });
});

test("disposing a recording releases the microphone and uploads nothing", async () => {
  const { media, tracks } = fakeMedia();
  const api = fakeApi();
  const recorder = createRecorder("/r", () => {}, { ...media, fetch: api.fetch });
  await recorder.start();
  recorder.dispose();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(tracks[0].stopped);
  assert.equal(api.sent.length, 0);
  assert.deepEqual(recorder.getState(), { status: "idle" });
});

test("Hear it plays the Reference Pronunciation from the API, one clip at a time", async () => {
  const { hearIt } = await import("../src/hooks/voice.ts");
  const played = [];
  globalThis.Audio = class {
    constructor(src) {
      this.src = src;
      played.push(this);
    }
    play = async () => {};
    pause = () => (this.paused = true);
  };
  await hearIt(" Nice to meet you ");
  await hearIt("deadline");
  assert.equal(played[0].src, "/api/pronunciation?text=Nice+to+meet+you");
  assert.ok(played[0].paused, "the first clip stops when the next one starts");
  assert.equal(played[1].src, "/api/pronunciation?text=deadline");
  delete globalThis.Audio;
});

test("MP4 microphone recordings upload with an audio filename", async () => {
  const { media } = fakeMedia({ mimeType: "audio/mp4" });
  const api = fakeApi([201, transcribed]);
  const recorder = createRecorder("/api/lessons/7/recordings", () => {}, { ...media, fetch: api.fetch });
  await recorder.start();
  recorder.stop();
  await until(() => recorder.getState().status === "done");
  const sent = await new Request("http://localhost", { method: "POST", body: api.sent[0].form }).formData();
  assert.equal(sent.get("audio").name, "answer.m4a");
});
