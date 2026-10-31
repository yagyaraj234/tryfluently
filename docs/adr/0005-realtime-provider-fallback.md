# Live calls run on OpenAI Realtime or Rime Prism, with automatic fallback

Decided 31 October 2026. Partly supersedes [0001](0001-openai-realtime-voice.md): live calls no longer depend on OpenAI alone. Everything else in 0001 still stands: the shared monthly allowance, recorded Lesson answers on `gpt-4o-transcribe`, Reference Pronunciation on Kenpath Svara, no pronunciation scoring and no stored audio.

## Decisions

**Two providers, one switch.** Voice Assessments and every voice Roleplay can run on OpenAI Realtime or on Rime Prism. `REALTIME_PROVIDER=openai|rime` picks the primary, and the default is `openai`. Prism is a speech-to-speech model that handles its own turn-taking and interruptions, which is what 0001 chose OpenAI for. Its events follow OpenAI Realtime's beta names, so it fits behind the same `Realtime` seam. A missing key leaves only the other provider, with no fallback.

**Each provider keeps its own transport.** OpenAI calls stay on WebRTC, unchanged, because they are the fallback. Prism has no WebRTC and no browser tokens. The browser streams 16 kHz PCM16 to an API WebSocket, which forwards it to Prism with the key, and plays the 24 kHz replies back through a media stream so echo cancellation still works. The browser posts its call request as before. The API answers with an SDP answer for OpenAI, or tells the browser to open the WebSocket for Rime.

**The broker stays provider-blind.** The Rime adapter renames Prism events to the names the broker already handles. `response.text.done` becomes the coach's transcript. The browser's `prism.playback.drained` stands in for `output_audio_buffer.stopped`, which ends a call after the closing line of an `end_call`. Call limits, wrap-up, hangup and transcripts keep one implementation.

**Fallback is automatic, in both directions.** If a call fails to connect (Prism gets 5 seconds to set up), or fails partway through, the browser makes the same call request again and the API starts it on the other provider. Failures are:

- a connection error or timeout
- a socket that closes before we hang up
- close code 1001 or 1011
- a browser that can't open the Rime socket (this switches the call but doesn't trip the breaker below, because the server can't tell it from one Learner's network)

Hanging up, `end_call`, the allowance, the Assessment deadline, Prism's 5-minute idle timeout and a browser that doesn't join a Rime call within 15 seconds end a call normally. A call switches provider at most once. If the second provider also drops, the Learner sees the existing "dropped" state. During the switch they see "Reconnecting…", and the coach's voice changes.

**A circuit breaker remembers failures.** After a failure, the API sends new calls to the other provider for 5 minutes, then tries the primary again. Nobody watches it or edits env vars. The breaker lives in memory, like the broker's call registry, so it holds for one API instance. OpenAI's mid-call closes don't trip it yet, because its close codes aren't classified. The dropped call still moves to Rime when the browser resumes it.

**A new call continues the conversation.** Any call that starts with a saved transcript gets it in its instructions and is told not to greet the Learner again. The coach still speaks first: it opens a new call, and picks a resumed one up where it stopped. This covers fallback and a manual retry after a drop.

**Voices follow the Roleplay or Assessment.** Each call picks its provider's voice from the Roleplay or Assessment id, so a retry on the same provider keeps the voice. A switch to the other provider changes it, because the two lists differ.

**Usage records the provider.** Each attempt writes its own `ai_usage` row with `provider` in its `usage` JSON. Every attempt's seconds count toward the shared monthly allowance.

## Known risks

- Prism runs only in us-east-2, and Rime audio adds a hop through our API.
- Raw PCM over a WebSocket copes worse with poor mobile networks than WebRTC does.
- Rime doesn't publish Prism pricing, and its SDKs are alpha. We use the raw WebSocket API, not the SDK.
- Prism speaks English only, which is fine for English practice.

## Considered Options

- **One WebSocket transport for both providers**: the browser wouldn't need to know the provider, but it means rewriting the proven fallback and dropping WebRTC's handling of poor networks.
- **Failover by hand only**: simpler, but someone would have to notice outages and change env vars.
- **Rime text-to-speech in our own STT → LLM → TTS pipeline**: rejected again for the reason in 0001. We would have to build turn detection and interruptions ourselves.
