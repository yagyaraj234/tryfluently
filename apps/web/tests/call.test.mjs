import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationEvent, startCall } from "../src/lib/call.ts";

// A live voice call (Voice Assessment, voice Roleplay) against a fake microphone, RTCPeerConnection and API.
function fakes({
  microphone = "allowed",
  reply = () => new Response("answer-sdp", { status: 201, headers: { "content-type": "application/sdp" } }),
} = {}) {
  const track = {
    enabled: true,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
  const stream = { getTracks: () => [track] };
  const sent = [];
  const played = [];
  const peers = [];
  let grant;

  class FakePeer {
    connectionState = "new";
    added = [];
    closed = false;
    constructor() {
      peers.push(this);
    }
    addTrack(t, s) {
      this.added.push([t, s]);
    }
    createDataChannel() {
      return (this.channel = {
        close() {
          this.closed = true;
        },
      });
    }
    async createOffer() {
      return { type: "offer", sdp: "offer-sdp" };
    }
    async setLocalDescription(d) {
      this.local = d;
    }
    async setRemoteDescription(d) {
      this.remote = d;
    }
    close() {
      this.closed = true;
      this.connectionState = "closed";
    }
    // Test helpers: what the browser would do.
    become(state) {
      this.connectionState = state;
      this.onconnectionstatechange?.();
    }
    remoteTrack(remote) {
      this.ontrack?.({ streams: [remote] });
    }
  }

  const deps = {
    getUserMedia: (constraints) => {
      assert.deepEqual(constraints, { audio: true });
      if (microphone === "denied")
        return Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
      if (microphone === "later") return new Promise((resolve) => (grant = () => resolve(stream)));
      return Promise.resolve(stream);
    },
    RTCPeerConnection: FakePeer,
    fetch: async (url, init) => {
      sent.push({ url, init });
      return reply();
    },
    play: (remote) => void played.push(remote),
  };
  return { deps, track, stream, sent, played, peers, grant: () => grant() };
}

function start(f, url = "/api/assessments/7/call") {
  const states = [];
  const call = startCall(url, { onChange: (s) => states.push(s) }, f.deps);
  return { call, states, last: () => states.at(-1) };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("a call sends the microphone over WebRTC: offer posted as application/sdp, answer applied, remote audio played", async () => {
  const f = fakes();
  const { last } = start(f);
  assert.equal(last()?.status ?? "connecting", "connecting");
  await settle();

  const [peer] = f.peers;
  assert.deepEqual(peer.added, [[f.track, f.stream]]);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].url, "/api/assessments/7/call");
  assert.equal(f.sent[0].init.method, "POST");
  assert.equal(new Headers(f.sent[0].init.headers).get("content-type"), "application/sdp");
  assert.equal(f.sent[0].init.body, "offer-sdp");
  assert.deepEqual(peer.remote, { type: "answer", sdp: "answer-sdp" });

  const remote = { id: "coach" };
  peer.remoteTrack(remote);
  assert.deepEqual(f.played, [remote]);

  peer.become("connected");
  assert.equal(last().status, "live");
});

test("mute switches the microphone track off and back on", async () => {
  const f = fakes();
  const { call } = start(f);
  await settle();
  call.mute(true);
  assert.equal(f.track.enabled, false);
  call.mute(false);
  assert.equal(f.track.enabled, true);
});

test("hanging up releases the microphone and closes the connection, and is not a drop", async () => {
  const f = fakes();
  const { call, states, last } = start(f);
  await settle();
  f.peers[0].become("connected");
  call.hangUp();
  assert.equal(f.track.stopped, true);
  assert.equal(f.peers[0].closed, true);
  assert.equal(last().status, "ended");
  f.peers[0].become("failed");
  assert.ok(!states.some((s) => s.status === "dropped"));
});

test("a connection that fails resumes once away from its provider; failing again is reported once as dropped", async () => {
  const f = fakes();
  const { states, last } = start(f);
  await settle();
  const [peer] = f.peers;
  peer.become("connected");
  peer.become("disconnected");
  assert.equal(last().status, "reconnecting");
  peer.become("failed");
  assert.equal(last().status, "reconnecting");
  assert.equal(peer.closed, true);
  assert.equal(f.track.stopped, false, "the microphone stays for the resumed call");
  await settle();
  assert.equal(f.sent[1].url, "/api/assessments/7/call?after=openai");
  const second = f.peers[1];
  assert.deepEqual(second.added, [[f.track, f.stream]]);
  peer.become("failed");
  second.become("connected");
  assert.equal(last().status, "live");

  second.become("failed");
  assert.equal(last().status, "dropped");
  assert.equal(f.track.stopped, true);
  assert.equal(second.closed, true);
  assert.equal(states.filter((s) => s.status === "dropped").length, 1);
});

test("a refused resume (the coach ended the call) is a drop, not a failure", async () => {
  let posts = 0;
  const f = fakes({
    reply: () =>
      posts++
        ? Response.json({ error: "This call has ended" }, { status: 409 })
        : new Response("answer-sdp", { status: 201, headers: { "content-type": "application/sdp" } }),
  });
  const { last } = start(f);
  await settle();
  f.peers[0].become("failed");
  await settle();
  assert.deepEqual(last(), { status: "dropped" });
  assert.equal(f.track.stopped, true);
});

test("a connection that recovers goes back to live", async () => {
  const f = fakes();
  const { last } = start(f);
  await settle();
  f.peers[0].become("connected");
  f.peers[0].become("disconnected");
  f.peers[0].become("connected");
  assert.equal(last().status, "live");
});

test("a denied microphone is its own state, and nothing is posted", async () => {
  const f = fakes({ microphone: "denied" });
  const { last } = start(f);
  await settle();
  assert.equal(last().status, "microphone");
  assert.equal(f.sent.length, 0);
  assert.equal(f.peers.length, 0);
});

test("a refused call (409 already live) fails with the response, and releases the microphone", async () => {
  const f = fakes({ reply: () => Response.json({ error: "You already have a live voice call" }, { status: 409 }) });
  const { last } = start(f);
  await settle();
  assert.deepEqual(last(), {
    status: "failed",
    response: { status: 409, body: { error: "You already have a live voice call" } },
  });
  assert.equal(f.track.stopped, true);
  assert.equal(f.peers[0].closed, true);
});

test("a network error fails without a response", async () => {
  const f = fakes({
    reply: () => {
      throw new TypeError("fetch failed");
    },
  });
  const { last } = start(f);
  await settle();
  assert.deepEqual(last(), { status: "failed" });
  assert.equal(f.track.stopped, true);
});

test("hanging up while the microphone is still being asked for never starts the call", async () => {
  const f = fakes({ microphone: "later" });
  const { call, last } = start(f);
  call.hangUp();
  f.grant();
  await settle();
  assert.equal(f.sent.length, 0);
  assert.equal(f.track.stopped, true);
  assert.equal(last().status, "ended");
});

test("coach presence and captions follow actual data-channel events, not a timer", async () => {
  const f = fakes();
  const changes = [];
  const call = startCall("/call", { onChange: () => {}, onConversation: (state) => changes.push(state) }, f.deps);
  await settle();
  const channel = f.peers[0].channel;
  const emit = (event) => channel.onmessage({ data: JSON.stringify(event) });
  emit({ type: "input_audio_buffer.speech_started" });
  assert.equal(changes.at(-1).phase, "listening");
  emit({ type: "input_audio_buffer.speech_stopped" });
  assert.equal(changes.at(-1).phase, "thinking");
  emit({ type: "output_audio_buffer.started" });
  emit({ type: "response.output_audio_transcript.delta", delta: "Hello " });
  emit({ type: "response.output_audio_transcript.delta", delta: "there" });
  assert.deepEqual(changes.at(-1), { phase: "speaking", speaker: "coach", caption: "Hello there" });
  emit({ type: "response.done" });
  assert.equal(changes.at(-1).phase, "speaking", "generation finishing does not mean audio has finished playing");
  emit({ type: "conversation.item.input_audio_transcription.completed", transcript: "a late learner transcript" });
  assert.equal(changes.at(-1).caption, "Hello there");
  emit({ type: "output_audio_buffer.stopped" });
  assert.equal(changes.at(-1).phase, "ready");
  channel.onmessage({ data: "malformed" });
  call.hangUp();
  assert.equal(channel.closed, true);
  const count = changes.length;
  emit({ type: "input_audio_buffer.speech_started" });
  assert.equal(changes.length, count);
});

test("caption events are bounded and ignore malformed payloads", () => {
  const state = { phase: "ready" };
  assert.equal(conversationEvent(state, null), state);
  assert.equal(conversationEvent(state, { type: "response.output_audio_transcript.delta", delta: 42 }), state);
  assert.equal(
    conversationEvent(state, { type: "response.output_audio_transcript.delta", delta: "x".repeat(3000) }).caption
      .length,
    2000,
  );
});

test("clearing the coach audio after interruption keeps the Learner's listening state", () => {
  const listening = conversationEvent(
    { phase: "speaking", speaker: "coach" },
    { type: "input_audio_buffer.speech_started" },
  );
  assert.equal(conversationEvent(listening, { type: "output_audio_buffer.cleared" }).phase, "listening");
});

// A Rime call: the API answers with a WebSocket to join, and audio goes through it as PCM.
function rimeFakes() {
  const f = fakes({
    reply: () => Response.json({ provider: "rime", socket: "/api/realtime/rime_1" }, { status: 201 }),
  });
  const sockets = [];
  const audio = { played: [], stopped: 0, closed: false };
  f.deps.socket = (path) => {
    const ws = {
      path,
      readyState: 0,
      sent: [],
      send(data) {
        this.sent.push(JSON.parse(data));
      },
      close() {
        this.readyState = 3;
      },
      // Test helpers: what the API would do.
      open() {
        this.readyState = 1;
        this.onopen();
      },
      emit(event) {
        this.onmessage({ data: JSON.stringify(event) });
      },
    };
    sockets.push(ws);
    return ws;
  };
  f.deps.pcm = async (stream, onChunk, onIdle) =>
    Object.assign(audio, {
      stream,
      onChunk,
      onIdle,
      output: { id: "coach-pcm" },
      play: (chunk) => audio.played.push(chunk),
      stop: () => (audio.stopped++, 1200),
      close: () => (audio.closed = true),
    });
  return { ...f, sockets, audio };
}

test("a Rime call joins the API's socket, streams the microphone and plays the coach's audio", async () => {
  const f = rimeFakes();
  const { last } = start(f);
  await settle();
  const ws = f.sockets[0];
  assert.equal(ws.path, "/api/realtime/rime_1");
  assert.equal(f.peers[0].closed, true, "the WebRTC offer was only for asking");
  ws.open();
  await settle();
  assert.equal(last().status, "live");
  assert.equal(f.audio.stream, f.stream);
  assert.deepEqual(f.played, [{ id: "coach-pcm" }]);

  f.audio.onChunk("AAAA");
  assert.deepEqual(ws.sent, [{ type: "input_audio_buffer.append", audio: "AAAA" }]);
  ws.emit({ type: "response.audio.delta", item_id: "c1", delta: "BBBB" });
  assert.deepEqual(f.audio.played, ["BBBB"]);
});

test("Rime: talking over the coach stops playback and truncates; finished playback tells Prism it drained", async () => {
  const f = rimeFakes();
  const changes = [];
  startCall("/call", { onChange: () => {}, onConversation: (c) => changes.push(c) }, f.deps);
  await settle();
  const ws = f.sockets[0];
  ws.open();
  await settle();

  ws.emit({ type: "response.audio.delta", item_id: "c1", delta: "x" });
  assert.equal(changes.at(-1).phase, "speaking");
  ws.emit({ type: "response.done", response: { id: "r1", metadata: { prism_drain_token: "d1" } } });
  assert.equal(ws.sent.length, 0, "still playing, so not drained yet");
  f.audio.onIdle();
  assert.equal(changes.at(-1).phase, "ready");
  assert.deepEqual(ws.sent, [{ type: "prism.playback.drained", drain_token: "d1" }]);

  ws.emit({ type: "response.audio.delta", item_id: "c2", delta: "y" });
  ws.emit({ type: "input_audio_buffer.speech_started" });
  assert.equal(f.audio.stopped, 1);
  assert.deepEqual(ws.sent.at(-1), {
    type: "conversation.item.truncate",
    item_id: "c2",
    content_index: 0,
    audio_end_ms: 1200,
  });
  assert.equal(changes.at(-1).phase, "listening");
});

test("Rime: the API closing the socket resumes the call away from Rime once, then drops it; hanging up does not", async () => {
  const f = rimeFakes();
  const { last } = start(f);
  await settle();
  f.sockets[0].open();
  await settle();
  f.sockets[0].onclose();
  assert.equal(last().status, "reconnecting");
  assert.equal(f.audio.closed, true);
  await settle();
  assert.equal(f.sent[1].url, "/api/assessments/7/call?after=rime");
  f.sockets[1].open();
  await settle();
  assert.equal(last().status, "live");
  f.sockets[1].onclose();
  assert.equal(last().status, "dropped");
  assert.equal(f.track.stopped, true);

  const g = rimeFakes();
  const second = start(g);
  await settle();
  g.sockets[0].open();
  await settle();
  second.call.hangUp();
  g.sockets[0].onclose();
  assert.equal(second.last().status, "ended");
});
