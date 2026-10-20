# Voice end-to-end test cases

Run these with a disposable Learner, a real microphone and speaker, and valid `KENPATH_VOICE`.

| Flow                    | Action                                                                          | Expected result                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Voice Assessment        | Start a Voice Assessment, allow microphone, speak twice, end after four minutes | Realtime connects, both turns appear in transcript, Report includes fluency, no audio stored.                     |
| Voice Roleplay          | Start a Roleplay call, interrupt coach once, mute and unmute, then end          | Conversation resumes after interruption, mute controls browser audio, Debrief persists, call usage recorded once. |
| Recorded Step           | Record a `speakPrompt`, submit it, then complete Lesson                         | `gpt-4o-transcribe` text becomes Step answer, timing contributes to fluency, only transcript and timing stored.   |
| Reference Pronunciation | Play a Reference Pronunciation twice                                            | First request returns audible MP3 from Kenpath; second uses cached audio; content type is `audio/mpeg`.           |
| Failure recovery        | Deny microphone, retry failed transcription, make Kenpath return error          | UI offers text fallback or retry; no empty Step or cached failed clip is created.                                 |

## Monthly free voice allowance

- Profile: Free plan, remaining time, UTC renewal date, and an email link to hey@yagyaraj.com are visible at desktop and mobile widths.
- Both live call types consume the same 10-minute monthly allowance; recorded Steps and pronunciation playback do not.
- With exhausted credit, neither live-call screen requests microphone access. Roleplay offers typing where allowed; Assessment offers Written Assessment.
- A call using its final allowance gets a wrap-up warning and server hangup. Report/Debrief completion preserves transcripts; the UI explains time ran out rather than reporting a network drop.
- An Assessment with fewer than four minutes available warns that it may not count; the existing minimum stays in force.
- UTC month renewal restores the allowance. A call spanning renewal keeps its original deadline and charges only the overlapping seconds to each month.
- Provider connection failure consumes no time; a second concurrent call is refused. Extra-credit requests open the learner's email app without sending automatically.

## Local verification — 2026-10-20

| Check                                                                                                                             | Result and evidence                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared quota, ownership, fractional usage, UTC renewal, cross-year overlap, failed connections, concurrent admission, persistence | PASS: API suite, 237 tests across 35 files, on an isolated local test database; provider boundaries faked.                                                                                            |
| Profile, setup, exhausted states, written/text alternatives, countdown and legacy Lesson redirect                                 | PASS: web suite, 161 tests; final Assessment/Roleplay rerun, 32 tests.                                                                                                                                |
| Types, lint, formatting, production build                                                                                         | PASS: `bun run typecheck`, `bun run lint`, scoped `prettier --check`, `bun run build`, `git diff --check`.                                                                                            |
| Desktop and mobile layout, shared components, email link and written recovery navigation                                          | PASS: local Chrome; live authenticated Profile at 391 CSS pixels with no horizontal overflow; capped screens at 390 pixels and desktop using a stub API. Native email link inspected without sending. |
| Console                                                                                                                           | PASS for affected app UI: observed hydration warnings identify a browser-extension-injected `cz-shortcut-listen` attribute; no quota-component error observed.                                        |
| Provider calls, real microphone/speaker, deployed runtime, physical devices, assistive technology and production performance      | BLOCKED / unverified: not exercised in this local implementation pass; complete the real-service scenarios above before claiming release readiness.                                                   |
| Billing, credit grants, public search/share changes, new media or dependencies                                                    | N/A: outside this change.                                                                                                                                                                             |

Call slots and timers remain in memory. One API instance is supported; process restarts can lose an active call's timer and unsaved usage. Durable recovery and multi-instance admission remain separate work.

PR integration was rechecked against stage `fedb11c`: 248 API tests and 161 web tests passed, with the Assessment deadline and reconnect-transcript fixes retained. The API suite passed when rerun alone after eight five-second timeouts during the initial parallel check run. Typecheck, lint, production build and scoped formatting/diff checks passed. No new migration is introduced.
