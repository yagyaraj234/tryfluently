# Voice runs on OpenAI Realtime; no pronunciation scoring in v1

Partly superseded by [0005](0005-realtime-provider-fallback.md): live calls can also run on Rime Prism, with automatic fallback between the two.

Voice Assessments and Roleplays run on the OpenAI Realtime API (`gpt-realtime`) because it handles turn-taking and interruptions, which is what makes a Mock Interview feel real. Other voice Steps aren't conversations, so they are recorded and transcribed with `gpt-4o-transcribe` instead, which is about 10× cheaper and needs no live session. Kenpath Svara is text-to-speech only, and it plays Reference Pronunciation because it is cheap and fast. v1 does not score pronunciation, which keeps a third vendor out of the stack. Learner audio is never stored; only transcripts are kept.

## Free beta allowance

Every existing and new Learner has a Free account. Voice Assessments and voice Roleplays share 10 minutes of live call time per UTC calendar month, renewing on the first at 00:00 UTC. Both learner and coach time, including silence, count. Existing usage records in the current month count toward the allowance; no usage history is removed.

The API owns admission, a one-minute wrap-up warning, and hangup at the call's remaining allowance. Voice Assessments also keep their per-attempt 10-minute deadline; a call uses whichever limit runs out first. Calls crossing a month boundary are metered into each month; an already-running call keeps its original deadline. `/api/voice-minutes` returns `limitMinutes`, `usedSeconds`, `remainingSeconds`, `resetsAt`, and `callEndsAt` (null without a live call). Exhausted call requests return 429 with the allowance and beta contact message.

Short recorded Lesson answers and Reference Pronunciation remain separate from this allowance. Text practice and Written Assessments remain available. Voice Assessments keep their existing four-minute minimum; learners with fewer minutes see a warning and the written option.

Profile and voice entry screens explain the allowance and offer `mailto:hey@yagyaraj.com` to request more voice credits during beta. This does not introduce paid plans or automatic credit grants. Live-call tracking currently supports one API instance; distributed admission and restart recovery require a durable call registry.

## Considered Options

- **Gemini Live**: cheaper, but we chose OpenAI for its turn-taking quality.
- **Our own STT → LLM → TTS pipeline**: works with any model and costs less per minute, but we would have to build turn detection and interruption handling ourselves.
- **Azure Pronunciation Assessment**: the right tool when pronunciation scoring arrives. It was left out of v1 to cut scope.
- **An LLM judging pronunciation from transcripts or audio**: rejected, because the scores are too inconsistent to track progress over time.
