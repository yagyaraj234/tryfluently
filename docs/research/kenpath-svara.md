# Kenpath Svara TTS for Reference Pronunciation

**Historical vendor research (2026-10-15).** Voice roster, pricing and limits below are a dated snapshot. The current Reference Pronunciation integration is in `apps/api/src/pronunciation.ts`; verify vendor terms before relying on the figures.

Research for issue #3. Question: what does the Kenpath Svara TTS API offer for playing a word or phrase spoken correctly? It covers English voices and accents, request and response shape, latency, audio formats, caching and reuse, rate limits, and pricing.

Sources are Kenpath's own pages and public API responses, checked 2026-10-15. When the docs don't cover something, this note says so.

## TL;DR

- English (`eng` / `en`) is one of the 82 supported languages. The voice roster includes English-native voices with Indian, American and British accents. ([languages endpoint](https://api.kenpathlabs.com/v1/languages), [voices endpoint](https://api.kenpathlabs.com/v1/voices))
- `POST /v1/audio/speech` is request-compatible with OpenAI's speech API. The official OpenAI SDK works when you point `baseURL` at `https://api.kenpathlabs.com/v1`. The response body is raw audio. ([SDKs](https://docs.kenpathlabs.com/sdks), [Text to speech](https://docs.kenpathlabs.com/text-to-speech))
- First audio arrives in about 80 ms when streaming `pcm`. The docs give no latency figure for a buffered, non-streamed clip. ([docs](https://docs.kenpathlabs.com/llms-full.txt))
- The Terms say you own your output. Nothing in the Terms forbids caching or reusing it. ([Terms §7](https://kenpathlabs.com/terms))
- The free tier gives 100k characters a month and 2 concurrent streams. After that it's ₹1 per 1,000 characters ($0.01 outside India). ([pricing](https://kenpathlabs.com/pricing), [Svara page](https://kenpathlabs.com/svara))
- **Recommendation:** use it. Call it from the Hono API through the OpenAI SDK, and cache each clip by `(text, voice, lang, format)` in object storage. Reference words repeat a lot, so most plays will come from the cache and never use quota or concurrency. Start with an Indian English voice and let learners switch to US or UK.

## 1. English voices and accents

- The model covers 82 languages and can switch language mid-sentence. `GET /v1/languages` includes `{"iso3":"eng","iso1":"en","name":"English","region":"european"}`. ([languages endpoint](https://api.kenpathlabs.com/v1/languages), [Voices & languages](https://docs.kenpathlabs.com/voices))
- Every voice can speak all 82 languages. A voice's accent comes from its native language: "its native one is where its accent lives". So for English with a given accent, pick a voice whose `labels.native_language` is `English` and whose `accent_family` is the accent you want. ([Voices & languages](https://docs.kenpathlabs.com/voices))
- The docs say "320 human-reviewed voices". The live `GET /v1/voices` response returned 346 voices on 2026-10-15, and the endpoint answered without an API key. ([docs](https://docs.kenpathlabs.com/voices), [voices endpoint](https://api.kenpathlabs.com/v1/voices))
- English-native voices in that response (`labels.native_language == "English"`). Quality band is A unless noted. The bands come from `labels.quality_band`, and the docs don't define them.

| Accent | Voices (`voice_id`) |
|---|---|
| Indian | Alia `sv_92xqyy9r` (F), Ridhi `sv_jzznenun` (F), Sara `sv_dxnp35cw` (F), Zoya `sv_hmwrtb3q` (F), Rishi `sv_uvtkrjbp` (M), Zain `sv_n7x5qafg` (M); band B: Aryan `sv_3em9yb87` (M), Kunal `sv_v827y5j3` (M), Mira `sv_djdcwnpf` (F), Rehan `sv_j9y2z5ec` (M) |
| American | Grace `sv_a5thzx8v` (F), Harper `sv_d3xm8bqn` (F), Tyler `sv_b89hdu5p` (M), Wade `sv_6835mfvc` (M) |
| British | Imogen `sv_8uhhmj6e` (F), Poppy `sv_3ts79y8r` (F), Oliver `sv_kq5snfd4` (M), Rupert `sv_eh5ebnrm` (M) |
| Also available | Australian (Jack, Matilda, Sienna), Canadian (Avery, Hudson), Irish (Saoirse), African American (Marcus; Imani at band C) |

- Fetch the roster at runtime and don't hardcode it: "Fetch the roster at runtime rather than hardcoding a list; store each voice's `voice_id`". `GET /v1/voices/{voice_id}/preview` returns a sample clip. ([Voices & languages](https://docs.kenpathlabs.com/voices), [developers](https://kenpathlabs.com/developers))

## 2. Request and response shape

**Endpoint.** `POST https://api.kenpathlabs.com/v1/audio/speech` with `Authorization: Bearer $SVARA_API_KEY`. Keys look like `sk_live_…`. ([Text to speech](https://docs.kenpathlabs.com/text-to-speech), [Authentication](https://docs.kenpathlabs.com/llms-full.txt))

**Request fields** ([Text to speech](https://docs.kenpathlabs.com/text-to-speech)):

| Field | Notes |
|---|---|
| `input` | Required. At most 5,000 characters. The docs say "No SSML or phonemes". |
| `voice` | Required. An `sv_…` voice ID. |
| `model` | Defaults to `svara-tts-turbo`. Any value is accepted, so OpenAI SDK calls work. |
| `response_format` | `mp3`, `opus`, `aac`, `flac`, `wav` (default), `pcm`, `ulaw`, `alaw` |
| `sample_rate` | 8000, 16000, 22050, 24000 (default), 32000, 44100, 48000 |
| `speed` | 0.7–1.5, pitch-preserving. Default 1.0. A slowed playback (e.g. 0.8) could suit a "hear it slowly" button. |
| `lang` | Defaults to `auto`. Send `en` so the server normalizes numbers and dates. |
| `stream` | Defaults to false. |
| `bitrate_kbps` | 8–320. Defaults: mp3 128, opus 64, aac 96. |
| `pronunciation_dictionary_id` | Optional text-substitution rules (e.g. `SQL` → `sequel`). An unknown ID isn't an error: the response carries `X-Svara-Dictionary: miss`. ([Pronunciation](https://docs.kenpathlabs.com/pronunciation)) |
| `temperature`, `top_p`, … | Sampling knobs. The docs advise leaving them unset. |

**Response.** "The response body is the raw audio in your requested `response_format` (or a chunked stream when `stream: true`)." Every response carries an `x-request-id`. ([Text to speech](https://docs.kenpathlabs.com/text-to-speech), [API reference](https://docs.kenpathlabs.com/llms-full.txt))

**OpenAI compatibility.** The docs say the official OpenAI SDKs work "unmodified: point `base_url` at Svara and pass your key". Svara-only fields (`lang`, `stream`, `sample_rate`, sampling knobs) go in `extra_body` in Python or as extra properties in JS. The base URL for OpenAI SDKs includes `/v1`. The docs don't say what happens to OpenAI's own voice names (`alloy`, …) or to `instructions`. Use `sv_` IDs. ([SDKs](https://docs.kenpathlabs.com/sdks))

There are also ElevenLabs-compatible endpoints (`/v1/text-to-speech/{voice_id}`, including `/with-timestamps` for character-level timings) and a native WebSocket for input streaming (`/v1/audio/speech/stream-input`). Neither is needed for single words. ([developers](https://kenpathlabs.com/developers))

Example for our case (TypeScript, OpenAI SDK; the shape follows the docs, untested):

```ts
const openai = new OpenAI({ baseURL: "https://api.kenpathlabs.com/v1", apiKey: process.env.SVARA_API_KEY });
const res = await openai.audio.speech.create({
  model: "svara-tts-turbo",
  voice: "sv_uvtkrjbp", // Rishi, Indian English
  input: "comfortable",
  response_format: "mp3",
  // @ts-expect-error Svara extension
  lang: "en",
});
const bytes = Buffer.from(await res.arrayBuffer());
```

## 3. Latency

- "~80 ms to first audio" for streamed output. The docs tie this to `stream: true` with `pcm` output: "with `pcm` output first audio arrives in ~80 ms rather than after the whole clip is generated". ([Svara page](https://kenpathlabs.com/svara), [docs](https://docs.kenpathlabs.com/llms-full.txt))
- Compressed formats (`mp3`, `opus`) also stream "but add a little container overhead". ([docs](https://docs.kenpathlabs.com/llms-full.txt))
- **Not covered:** total time for a buffered (non-streamed) request, p95 figures, or the regions where it is served. A one-word clip is short enough that a buffered `mp3` request is probably fine. Measure it before relying on it.

## 4. Audio formats

`mp3`, `opus`, `aac`, `flac`, `wav`, `pcm` (headerless 16-bit LE mono), `ulaw`, `alaw`, at 8–48 kHz. The docs call mp3 "Best for web delivery and storage". ([Text to speech](https://docs.kenpathlabs.com/text-to-speech))

For the web app, `mp3` (or `opus`) at the default 24 kHz plays in an `<audio>` element and is small enough to cache.

## 5. Caching and reuse of output

- **Ownership:** Terms §7: subject to compliance, you own output made from your own text and consented reference audio. The Terms add no attribution requirement, and the IP terms survive termination (§11). ([Terms](https://kenpathlabs.com/terms))
- **Caching:** Neither the Terms nor the docs mention storing, caching or redistributing generated audio, so nothing forbids it. The one related restriction is that you may not "Resell or sublicense API access without our prior written consent" (§4). That covers API access, not audio files. ([Terms](https://kenpathlabs.com/terms))
- **Determinism:** The docs don't say whether the same input gives the same audio. Synthesis uses sampling (`temperature`, `top_p`, …), and `seed` is "accepted and ignored" on the ElevenLabs path. So assume each call can sound slightly different. That is one more reason to cache: a learner hears the same reference every time. ([Text to speech](https://docs.kenpathlabs.com/text-to-speech), [SDKs](https://docs.kenpathlabs.com/sdks))
- **Data retention:** The Terms grant Kenpath "a limited license to process your input and output solely to provide and support the service". Zero data retention is listed only for Enterprise. ([Terms](https://kenpathlabs.com/terms), [pricing](https://kenpathlabs.com/pricing))

## 6. Rate limits

Limits apply per organization, not per API key. They are counted on two axes: concurrent streams and characters per calendar month (UTC), where characters are the summed `input` length. ([Rate limits & errors](https://docs.kenpathlabs.com/rate-limits))

| Plan | Characters/month | Concurrent streams | Custom voices | Pronunciation dictionaries |
|---|---|---|---|---|
| Pay as you go | 100,000 free | 2 | 3 | 10 |
| Growth | 1,000,000 | 8 | 10 | Unlimited |
| Enterprise | Custom | Custom | Custom | Unlimited |

- Errors use the shape `{ "detail": { "status", "message" } }`. A 429 means one of three things: `rate_limit_exceeded` (a burst; back off), `too_many_concurrent_requests` (retry after about 1 s), or `insufficient_quota` (terminal until the month resets). A 429 may include `Retry-After`. ([Rate limits & errors](https://docs.kenpathlabs.com/rate-limits))
- Successful responses include `x-ratelimit-remaining-streams` and `x-ratelimit-remaining-characters`, and `GET /v1/user/subscription` reports usage. ([Rate limits & errors](https://docs.kenpathlabs.com/rate-limits), [Usage & subscription](https://docs.kenpathlabs.com/usage-api))
- **Not covered:** the burst threshold behind `rate_limit_exceeded` (requests per second).
- Two concurrent streams on the free tier is the real constraint. Several learners missing a word at once would get 429s without a cache.

## 7. Pricing

| Plan | Price | Included |
|---|---|---|
| Pay as you go | ₹0 to start, then ₹1 per 1,000 characters | 100,000 characters/month free (~1 h 40 min of audio) |
| Growth | ₹1,000/month, then ₹1 per 1,000 characters | 1,000,000 characters/month (~16 h of audio) |
| Enterprise | Custom | Zero data retention; EU/US/India data residency |

Source: [pricing](https://kenpathlabs.com/pricing). Outside India the Svara page lists $0.01 per 1,000 characters. ([Svara page](https://kenpathlabs.com/svara))

For scale: a reference word or short phrase is about 10–30 characters, so the free 100k characters cover roughly 3,000–10,000 uncached plays a month. With a cache, cost tracks the number of distinct words, not the number of plays.

## Fit for Impromptu

- **Good fit:** OpenAI-compatible, so the Hono API can call it with the standard `openai` npm package. It has Indian, US and UK English voices and returns small mp3 clips. The price is low, and the Terms allow caching.
- **Gaps:** there's no phoneme or IPA input ("No SSML or phonemes"), so a word the model misreads can only be fixed with a text-respelling rule in a pronunciation dictionary. The docs give no latency figure for buffered requests, and output isn't guaranteed to be deterministic.
- **Suggested flow:** Azure flags a word → the API checks the cache by `hash(text, voice_id, lang, format)` → on a miss it calls `/v1/audio/speech` (`mp3`, `lang: "en"`) and stores the clip → the client plays the URL.
