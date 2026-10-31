// Raw audio for a Rime call (ADR 0005): the microphone goes up as 16 kHz PCM16 and the coach comes back as 24 kHz
// PCM16. Playback runs through an <audio> element (the caller's `play`), so the browser's echo cancellation hears it.

// Averages the microphone down to 16 kHz and posts 20 ms chunks of PCM16.
const micWorklet = `
class Mic extends AudioWorkletProcessor {
  ratio = sampleRate / 16000; t = 0; sum = 0; n = 0; out = new Int16Array(320); i = 0;
  process([input]) {
    for (const s of input[0] ?? []) {
      this.sum += s; this.n++;
      if (++this.t < this.ratio) continue;
      this.t -= this.ratio;
      this.out[this.i++] = Math.max(-1, Math.min(1, this.sum / this.n)) * 0x7fff;
      this.sum = this.n = 0;
      if (this.i === this.out.length) {
        this.port.postMessage(this.out.buffer, [this.out.buffer]);
        this.out = new Int16Array(320); this.i = 0;
      }
    }
    return true;
  }
}
registerProcessor("mic", Mic);`;

const toBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

export type Pcm = {
  /** The coach's audio, for an <audio> element. */
  output: MediaStream;
  /** Queues one base64 chunk of the coach's 24 kHz PCM16. */
  play(chunk: string): void;
  /** Stops the coach mid-sentence and returns how many ms of the current reply were heard. */
  stop(): number;
  close(): void;
};

/** Streams `stream` to `onChunk` as base64 PCM16; `onIdle` fires when the coach's queued audio has all played. */
export async function pcm(stream: MediaStream, onChunk: (chunk: string) => void, onIdle: () => void): Promise<Pcm> {
  const ctx = new AudioContext();
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([micWorklet], { type: "text/javascript" })));
  const mic = new AudioWorkletNode(ctx, "mic", { numberOfOutputs: 0 });
  mic.port.onmessage = (m: MessageEvent<ArrayBuffer>) => onChunk(toBase64(m.data));
  ctx.createMediaStreamSource(stream).connect(mic);
  const out = ctx.createMediaStreamDestination();
  await ctx.resume();

  const playing = new Set<AudioBufferSourceNode>();
  let until = 0;
  // ponytail: measures from when this stretch of audio started, which is the reply's item unless audio underran.
  let startedAt = 0;
  return {
    output: out.stream,
    play(chunk) {
      const bytes = Uint8Array.from(atob(chunk), (c) => c.charCodeAt(0));
      const samples = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
      const buffer = ctx.createBuffer(1, samples.length || 1, 24_000);
      buffer.getChannelData(0).set(Float32Array.from(samples, (s) => s / 0x8000));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(out);
      if (!playing.size) startedAt = until = ctx.currentTime;
      source.start(until);
      until += buffer.duration;
      playing.add(source);
      source.onended = () => {
        playing.delete(source);
        if (!playing.size) onIdle();
      };
    },
    stop() {
      for (const source of playing) {
        source.onended = null;
        source.stop();
      }
      const heard = playing.size ? Math.round((ctx.currentTime - startedAt) * 1000) : 0;
      playing.clear();
      return heard;
    },
    close: () => void ctx.close(),
  };
}
