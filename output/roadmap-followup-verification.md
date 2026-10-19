# Roadmap follow-up — 19 October 2026

Each Unit now contains 3–5 distinct practice Lesson outlines, plus a named Roleplay where applicable. Titles and focus come from the Learner and Unit context. Actual Steps remain adaptive and are generated when reached. Existing Lessons are preserved. Future outlines are stored in `unit.lesson_outline`; local migration 0007 was applied.

Unit headers show a compact, single-line objective. The Roadmap has no separate Resume button: existing Lesson circles link directly to saved practice, and available future circles open a Start Lesson dialog. Locked circles remain noninteractive. The existing project theme is retained.

## Verification

- Browser: real local Roadmap populated with distinct Lesson outlines across 10 Units; no generic repeated placeholders. Active circle resumed the existing saved Step without submitting an answer.
- Responsive: desktop visually inspected; 390px mobile viewport had `scrollWidth === innerWidth === 390`. Temporary viewport restored.
- Browser evidence: `roadmap-followup.png` and `roadmap-followup-mobile.png`.
- Typecheck, lint, production build and whitespace checks passed.
- UI suite: 193 passed. Web suite: 122 passed; updated focused Roadmap suite: 15 passed, including two additional cases for opening the first circle and a ready Roleplay.
- Initial combined API run found two old title expectations and one timeout under concurrent suite/build load. Expectations now check saved outline titles; the separate full API rerun passed all 172 tests, with zero failures.

## Streak diagnosis

Streak is already fetched from backend `/api/progress`, calculated from completed Lessons in the Learner’s timezone, and invalidated after Lesson completion. Answered Steps earn XP but do not start a Streak.

Read-only local database inspection found two answered Steps and zero completed Lessons. Browser showed 20 XP and zero Streak, matching the backend rules. Timezone and midnight grace/reset cases passed in the six progress tests. No scoring rule was changed.

## Limits

The first live outline attempt showed a retry notice; retry succeeded and the generated outlines persisted. A suspected Bun request timeout did not reproduce in an 11-second assert-based check using the actual server config, so no speculative server change was made.

No real Lesson was completed during browser verification, to preserve Learner history. No deployment or commit performed. Other environments require migration before the updated API runs.
