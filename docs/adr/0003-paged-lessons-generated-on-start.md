# Paged Lessons, generated when the Learner presses Start

Updated 20 October 2026. Partly superseded by [0004](0004-end-of-lesson-quiz-practice-rounds-follow-up-lessons.md). Supersedes the "prepare the next Lesson automatically" and "one-call Lesson" parts of [0002](0002-just-in-time-lesson-generation.md). Stable Roadmap outlines, immutable content and "completion regardless of score" still stand.

## Decisions

**A Lesson is a 3–10 minute sitting.** It has 4–6 **Pages** (about 150 words at most, one idea each) plus a recap Page. The Roadmap outline gains `estimatedMinutes` and a planned page count. Roleplays are unchanged and stay separate from this flow.

**Nothing is generated ahead of the Learner.** Finishing a Lesson only unlocks the next one. Tapping an unlocked Lesson opens a dialog built from the stored outline (title, objective, skill, estimated time), with no model call. Generation starts only when the Learner presses **Start learning**. The first Lesson after an Assessment follows the same rule.

**Generation is a background job with a fan-out.** A `lesson` job kind joins the Postgres queue.

1. A **planner** call gets the full Skill Profile, Focus Items and Learner Memory, and writes the page plan: one idea and one **Block** type per Page.
2. **Page-writers** run in parallel, each given its plan slice and a one-line level hint. All calls use the fast model with low reasoning effort.
3. A **question agent** runs once every Page is written and fills each Page's question slot with the question, answer and explanation.

Each Page is checked with a schema and cheap rules (word cap, answer not leaked). A failed Page is retried alone, twice at most. If it still fails the Lesson is `failed` and the Learner can retry. The client polls every 1–2 seconds and stops once all Pages are ready. A loading screen covers the wait until Page 1; the rest stream in. The target is Page 1 in about 10 seconds and everything in about 20.

**Pages hold typed Blocks.** A Block is typed JSON that a React component renders: reading and example cards, vocabCard, fillGap, multipleChoice, matchPairs, reorder, rewrite and speakPrompt. The model never writes layout.

**Feedback is instant.** Blocks whose answer is known at generation time (fillGap, multipleChoice, matchPairs, reorder, vocabCard) are graded on submit with a pre-written explanation. Rewrite is judged by one fast model call on submit. Speaking uses browser speech-to-text, so no audio is uploaded or stored; the recording stays in browser memory. The transcript goes to a fast text analysis, which is told that recognizers can smooth over errors. Browsers without speech recognition get a text answer.

**Finishing is instant.** It marks the Lesson complete, awards XP and unlocks the next Lesson, with no model call. Skill scores update from graded answers. A background job then writes the summary, Focus Items and Learner Memory, and the end screen shows a short "what I learned" card from it. The next Lesson's planner waits up to about 5 seconds for that job, then continues with the context it has. A separate Lesson Report page is no longer produced for new Lessons.

Feedback that arrives after Finish, including a successful retry, revises that Lesson's one measurement per skill. Later moving averages are recalculated from their saved results and weights, so late feedback neither applies the Lesson twice nor erases newer evidence. Failed or unmeasured answers stay excluded. Historical score rows without saved results and weights remain fixed checkpoints; existing history is not guessed or backfilled.

**Resume.** `currentPage` on the Lesson reopens it where the Learner left off. Stored content is never regenerated.

## Existing data

Lessons prepared before this change keep their format and player, with no backfill. New Lessons carry a new content schema version.

## Superseded from 0002

- Preparing the next Lesson automatically (after the Assessment and after completion).
- One model call for all of a Lesson's material and questions.
- Learner-facing Lesson Report and a judge call that blocks completion for new Lessons.
