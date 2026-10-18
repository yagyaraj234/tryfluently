# Voice end-to-end test cases

Run these with a disposable Learner, a real microphone and speaker, and valid `KENPATH_VOICE`.

| Flow | Action | Expected result |
| --- | --- | --- |
| Voice Assessment | Start a Voice Assessment, allow microphone, speak twice, end after four minutes | Realtime connects, both turns appear in transcript, Report includes fluency, no audio stored. |
| Voice Roleplay | Start a Roleplay call, interrupt coach once, mute and unmute, then end | Conversation resumes after interruption, mute controls browser audio, Debrief persists, call usage recorded once. |
| Recorded Step | Record a `speakPrompt`, submit it, then complete Lesson | `gpt-4o-transcribe` text becomes Step answer, timing contributes to fluency, only transcript and timing stored. |
| Reference Pronunciation | Play a Reference Pronunciation twice | First request returns audible MP3 from Kenpath; second uses cached audio; content type is `audio/mpeg`. |
| Failure recovery | Deny microphone, retry failed transcription, make Kenpath return error | UI offers text fallback or retry; no empty Step or cached failed clip is created. |
