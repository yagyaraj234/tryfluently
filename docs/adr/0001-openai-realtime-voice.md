# Voice runs on OpenAI Realtime; no pronunciation scoring in v1

Voice Assessments and Roleplays run on the OpenAI Realtime API (`gpt-realtime`) because it handles turn-taking and interruptions, which is what makes a Mock Interview feel real. Other voice Steps aren't conversations, so they are recorded and transcribed with `gpt-4o-transcribe` instead, which is about 10× cheaper and needs no live session. Kenpath Svara is text-to-speech only, and it plays Reference Pronunciation because it is cheap and fast. v1 does not score pronunciation, which keeps a third vendor out of the stack. Learner audio is never stored; only transcripts are kept.

## Considered Options

- **Gemini Live**: cheaper, but we chose OpenAI for its turn-taking quality.
- **Our own STT → LLM → TTS pipeline**: works with any model and costs less per minute, but we would have to build turn detection and interruption handling ourselves.
- **Azure Pronunciation Assessment**: the right tool when pronunciation scoring arrives. It was left out of v1 to cut scope.
- **An LLM judging pronunciation from transcripts or audio**: rejected, because the scores are too inconsistent to track progress over time.
