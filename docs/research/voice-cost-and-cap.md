# Voice cost and enforcing the 15-minute daily cap

**Current allowance (2026-10-20):** All accounts are Free during beta. Voice Assessments and Roleplays share 10 minutes per UTC calendar month. See [ADR 0001](../adr/0001-openai-realtime-voice.md#free-beta-allowance). The daily cap and Assessment exemption below are historical.

**Historical cost research (2026-10-15).** Prices, quotas and model availability can change. The implemented cap and call ownership live in `apps/api/src/realtime.ts`; use that code and the current provider terms for operational decisions. Azure pronunciation scoring discussed below is outside v1 per [ADR 0001](../adr/0001-openai-realtime-voice.md).

Research for issue #6. Sources checked 2026-10-15. Prices are list prices in USD unless noted.

## Answer

- **One learner voice-minute costs about $0.08 on `gpt-realtime`, or about $0.04 on `gpt-realtime-mini`.** OpenAI Realtime is most of it. Azure Pronunciation Assessment adds about $0.022 and Kenpath almost nothing. The figures assume a 50/50 talk split and working prompt caching.
- **A 10-minute Assessment costs about $0.78 on `gpt-realtime` ($0.41 on mini).**
- **A full 15-minute day costs about $1.20 on `gpt-realtime` ($0.64 on mini).** The Assessment doesn't count toward the cap, so a day that includes one costs about $2.
- **Without cache hits the cost rises 6 to 8 times** (up to about $0.48/min on `gpt-realtime` by minute 15), because every Response re-sends the whole conversation. Caching is best-effort, so the cap has to hold even in the worst case.
- **Enforcement:** use OpenAI's unified interface, where our API relays the SDP and holds the only key. Our API also opens a sideband WebSocket to the call and hangs it up with `POST /v1/realtime/calls/{call_id}/hangup` when the learner's remaining seconds run out. Don't give the browser ephemeral tokens, and don't relay the audio through our API.

## 1. Price inputs (primary sources)

### OpenAI Realtime

Per 1M tokens, from https://developers.openai.com/api/docs/pricing:

| Model               | Audio in | Audio in (cached) | Audio out | Text in | Text in (cached) | Text out |
| ------------------- | -------- | ----------------- | --------- | ------- | ---------------- | -------- |
| `gpt-realtime`      | $32.00   | $0.40             | $64.00    | $4.00   | $0.40            | $16.00   |
| `gpt-realtime-mini` | $10.00   | $0.30             | $20.00    | $0.60   | $0.06            | $2.40    |

The same page lists `gpt-realtime-2` and `gpt-realtime-2.1` at the same audio rates as `gpt-realtime` (text out is $24), and `gpt-realtime-2.1-mini` at the same rates as `gpt-realtime-mini`. The model choice inside each tier doesn't change the audio cost.

How tokens are counted, from https://developers.openai.com/api/docs/guides/realtime-costs:

- "Audio tokens in user messages are 1 token per 100 ms of audio", which is 600 tokens per minute of learner speech.
- "audio tokens in assistant messages are 1 token per 50ms of audio", which is 1,200 tokens per minute of coach speech.
- "The entire conversation is sent to the model for each Response." Each turn re-bills all the history as input tokens.
- Caching is automatic but "best-effort and not guaranteed". It breaks when instructions, tools or earlier items change.
- Cost levers are `token_limits.post_instructions`, `retention_ratio` below 1, deleting or summarising old items, and the mini model.
- Realtime has no per-minute price. The only per-minute voice price on the pricing page is `gpt-live-1` at $0.05/min, "billed per second" (https://developers.openai.com/api/docs/pricing). That is a different product and wasn't evaluated here.
- If we turn on input transcription, `gpt-4o-mini-transcribe` costs $0.003/min and `gpt-4o-transcribe` costs $0.006/min (https://developers.openai.com/api/docs/pricing).

### Azure Pronunciation Assessment

- "As a baseline, usage of pronunciation assessment costs the same as speech to text for Standard or commitment tier pricing." The prosody score "isn't included in the baseline speech to text price" and costs extra as an add-on. Content scores (vocabulary, grammar, topic) and prosody are en-US only (https://learn.microsoft.com/en-us/azure/ai-services/speech-service/pronunciation-assessment-tool).
- The pricing page lists "Pronunciation Assessment (prosody)" as an enhanced add-on billed "per hour per feature". The page renders its dollar amounts in JavaScript (https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/).
- Microsoft's Retail Prices API gives the amounts for eastus, pay-as-you-go: `S1 Speech To Text` is **$1.00 per hour** and `S1 Speech to Text Enhanced Feature Audio` is **$0.30 per hour** (https://prices.azure.com/api/retail/prices?$filter=armRegionName%20eq%20'eastus'%20and%20contains(productName,'Speech')).
- The free F0 tier includes 5 audio hours a month (https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/).
- Audio longer than 30 seconds needs continuous mode (https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment).

So scoring costs $1.30 per audio hour with prosody ($0.0217/min) and $1.00 per hour without it ($0.0167/min).

### Kenpath Svara TTS

From https://kenpathlabs.com/pricing:

- ₹1 per 1,000 characters on every plan, which the page puts at about ₹1 per minute of audio.
- Pay-as-you-go includes 100,000 free characters a month and 2 concurrent streams.
- The Growth plan is ₹1,000 a month for 1,000,000 characters and 8 concurrent streams.

## 2. Assumptions

These are mine, not from a source.

1. **Talk split is 50/50.** Each turn is 15 s of learner speech and 15 s of coach speech, so a minute has 2 turns.
2. **Instructions and tools take 1,500 text tokens.** The transcript adds about 3.3 text tokens per spoken second of output.
3. **There is no truncation and no item deletion.** History grows for the whole session, which matches the default behaviour (https://developers.openai.com/api/docs/guides/realtime-costs).
4. **Caching is modelled at two extremes.** In the "cached" case all prior context hits the cache and only the new learner audio is billed at the uncached rate. In the "no cache" case nothing hits the cache.
5. **Azure scores every second of the voice-minute.** This is conservative. If we stream only the learner's turns, the Azure line halves.
6. **Kenpath plays about 20 Reference Pronunciations a day at about 80 characters each,** which is 1,600 characters or ₹1.6. I converted at roughly ₹88 = $1, an assumption I didn't source, which gives about $0.02 a day. The 100k free characters a month cover about 60 such learner-days.

To check by hand, take the first turn on `gpt-realtime`: 150 audio in × $32, 1,500 text in × $4, 300 audio out × $64 and 50 text out × $16, per 1M tokens, comes to about $0.031. Each later turn adds the growing history as input: cached at $0.40/M, or at the full rate when the cache misses.

## 3. Results

### OpenAI Realtime only

| Model               | Cache | 1 min  | 10 min | 15 min | $/min at 15 min |
| ------------------- | ----- | ------ | ------ | ------ | --------------- |
| `gpt-realtime`      | hits  | $0.056 | $0.55  | $0.85  | $0.057          |
| `gpt-realtime`      | none  | $0.076 | $3.39  | $7.27  | $0.485          |
| `gpt-realtime-mini` | hits  | $0.016 | $0.18  | $0.29  | $0.019          |
| `gpt-realtime-mini` | none  | $0.022 | $1.03  | $2.23  | $0.148          |

- If the learner talks twice as much as the coach, a 10-minute session drops to $0.45 on `gpt-realtime` and $0.15 on mini. Output audio is the most expensive line.
- Splitting a day into five 3-minute sessions costs $0.80 instead of $0.85 with caching. Without caching the gap is much larger, because each session starts with an empty history.

### All three vendors

| Scenario                                                      | `gpt-realtime`                  | `gpt-realtime-mini`             |
| ------------------------------------------------------------- | ------------------------------- | ------------------------------- |
| Per voice-minute (cached)                                     | ~$0.08 (0.056 + 0.022 + ~0.001) | ~$0.04 (0.018 + 0.022 + ~0.001) |
| 10-minute Assessment                                          | ~$0.78 (0.55 + 0.22 + ~0.01)    | ~$0.41 (0.18 + 0.22 + ~0.01)    |
| 15-minute day (cap)                                           | ~$1.20 (0.85 + 0.33 + ~0.02)    | ~$0.64 (0.29 + 0.33 + ~0.02)    |
| 15-minute day, no cache hits                                  | ~$7.6                           | ~$2.6                           |
| Learner who uses every minute for 30 days, plus 4 Assessments | ~$39                            | ~$21                            |

The Assessment doesn't count toward the 15 minutes (see the map in issue #1), so a learner can use up to 25 voice minutes on a day they take one.

## 4. Enforcing the cap when the browser talks to OpenAI directly

### What the platform gives us

- **Ephemeral client secrets.** `POST /v1/realtime/client_secrets` takes `expires_after.seconds` "between 10 and 7200", with a default of 600. "The session itself may continue after that time once started", and "a secret can be used to create multiple sessions until it expires" (https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create). A short TTL limits when sessions can start, not how long they run. A modified client can also open several sessions with one secret.
- **Session max duration.** "The maximum duration of a Realtime session is 60 minutes" (https://developers.openai.com/api/docs/guides/realtime-conversations). That backstop is far above 15 minutes.
- **Unified interface.** The browser sends its SDP offer to our server. The server posts it with the session config to `https://api.openai.com/v1/realtime/calls` using "a standard API key", and returns the SDP answer. The docs note this "puts your application server in the critical path for session initialization" (https://developers.openai.com/api/docs/guides/realtime-webrtc).
- **Call ID.** The response "will contain a `Location` header that has a unique call ID", which the server can use to open a WebSocket to the same session (https://developers.openai.com/api/docs/guides/realtime-server-controls). With ephemeral tokens the browser gets this header, so our server only learns the call ID if the client reports it, and a modified client can lie.
- **Sideband.** The server connects to `wss://api.openai.com/v1/realtime?call_id=rtc_xxxxx` with its API key and can watch events and update the session (https://developers.openai.com/api/docs/guides/realtime-server-controls). `response.done` events carry `usage` with input, output and cached token counts (https://developers.openai.com/api/docs/guides/realtime-costs).
- **Hang up.** `POST /v1/realtime/calls/{call_id}/hangup` will "End an active Realtime API call, whether it was initiated over SIP or WebRTC" (https://developers.openai.com/api/reference/resources/realtime/subresources/calls/methods/hangup). This is the server-side kill switch.
- **Webhooks.** I found no webhook for a Realtime session ending or for usage. The webhooks guide only names `response.completed` (https://developers.openai.com/api/docs/guides/webhooks). Metering has to come from the sideband or our own clock.

### Recommendation: unified interface, sideband, and hang up

1. `POST /voice/session` on our Hono API checks auth and reads the learner's `seconds_used` for their local day from Postgres. It refuses the request if no seconds remain or if the learner already has a live call (one call per learner, enforced by a unique row).
2. The API posts the browser's SDP plus the session config (model, instructions, `token_limits`) to `/v1/realtime/calls` with our key. It reads the `call_id` from `Location`, records `{learner, call_id, started_at}`, and returns only the SDP answer. The browser never holds a credential, so it can't start a call we don't know about.
3. The API opens the sideband WebSocket for that `call_id`. It:
   - sets a timer for the remaining seconds;
   - at about T−60 s, sends a `session.update` asking the coach to wrap up, which is a UX nicety;
   - at T, calls `/hangup`;
   - on socket close or hangup, writes `now - started_at` into `seconds_used`;
   - logs `response.done.usage` for spend monitoring.
4. Bill wall-clock time from call start to close. That is simpler than counting tokens, it's what the learner sees as "minutes", and it can't be gamed by staying silent. The 60-minute OpenAI limit stays in place as the last backstop.
5. If the API process restarts mid-call, run a sweep on boot. It hangs up any recorded call with no end time and charges it up to the hang-up time, which covers the case of losing the in-memory timer.

The Assessment uses the same path but is metered against its own 10-minute limit instead of the daily counter.

### Rejected alternatives

- **Ephemeral token with a short TTL.** It doesn't stop a running session. One secret can open several sessions, and the server doesn't see the `call_id`. The cap could only be enforced on the honour system.
- **Relaying the audio through our API** (browser to Hono to OpenAI WebSocket). It gives full control, but every audio frame then crosses our server, which adds latency and bandwidth we pay for and puts audio transport on us. The unified interface gives the same hard stop through `/hangup` without any of that. This is my engineering judgement, not something the docs state.

## Open points

- Measure real cache-hit rates in the Realtime Playground Logs tab (https://developers.openai.com/api/docs/guides/realtime-costs) before deciding between `gpt-realtime` and mini. The 6 to 8 times worst case dominates the budget.
- Re-check the ₹ to $ rate and the Azure region price when picking a region. The figures above are for eastus.
