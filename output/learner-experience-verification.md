# Learner experience verification

18 October 2026. Implementation stays local and uncommitted. Existing Impromptu theme retained; screenshots guided structure and interaction only. No palette, font or Button-theme changes remain.

## Implemented scope

- Three starter stages: Goal cards, situation choices, optional Goal Context/date. Back preserves inputs in the mounted flow. No Skip link. Situation/date are saved as Goal Context; there is no scheduling feature.
- Voice/Written choice with voice preparation before call creation. Written Assessment starts with the coach and renders conversational bubbles. Voice has an original vector coach, event-driven presence, captions, mute and end controls.
- Assessment Report includes editable Goal/Target Level suggestions and one Build my Roadmap action. Partial confirmation failure retains successful saves; retry only submits remaining suggestions. A failed suggestions request does not hide the Report.
- Unit headers and winding known Lesson nodes. Future Units stay locked; no fabricated Lesson names/counts. Planned Lessons precede their Roleplay milestone. Learner-facing Unit Skip action removed; existing automatic mastery/cap rules remain unchanged.
- Optional teaching attached to each just-in-time Step. Back revisits teaching without discarding the current answer. Multiple blanks and reorder added, with server grading and validation. Reorder supports drag and keyboard/touch buttons, announcements and retained focus. Completed Lessons have read-only review without awarding more XP.
- Shared components remain in `packages/ui`; routes own data, microphone and WebRTC behavior. No dependencies added.

## Commands and results

| Gate | State | Evidence |
| --- | --- | --- |
| API tests | PASS | `bun test` in `apps/api`: 168 pass, 0 fail. Includes new Step round-trips, saved teaching, authoritative grading and malformed/permutation answer rejection. |
| UI tests | PASS | `bun test` in `packages/ui`: 191 pass, 0 fail. Includes blanks, reorder controls/focus, teaching navigation, coach captions/mute/end. Existing overlay tests emit act warnings. |
| Web tests | PASS | `node --test --test-concurrency=1 tests/*.test.mjs` in `apps/web`: 122 pass, 0 fail. Covers SSR routes, report fallback, no Skip UI, call lifecycle/events, voice/text transports and existing flows. |
| Types | PASS | `bun run typecheck`: all four packages. |
| Lint | PASS | `bun run lint`: all three lint tasks. |
| Production build | PASS | `bun --cwd apps/web build`: client and server builds complete. |
| Diff whitespace | PASS | `git diff --check`. |
| Local migration | PASS | Verified database target `localhost:5433/impromptu`; `bun --env-file=../../.env run migrate` in `packages/db` succeeds. Migration only adds `fillGaps` and `reorder` enum values. Test database migration also passed through API setup. |

Logs: `/tmp/impromptu-api-test.log`, `/tmp/impromptu-ui-test.log`, `/tmp/impromptu-web-test.log`, `/tmp/impromptu-web-build.log`.

## Browser checks

Chrome, rendered application with real client interactions. Most flow checks used an isolated stub API, not an AI provider or the Learner's live records. Shared guide preview is `/design-system?preview=learning`.

| Route / flow | State | Observed evidence |
| --- | --- | --- |
| `/goals` | PASS | Actual three-stage navigation; last screen stays editable until explicit save. Stub assertion: zero creates/confirms while advancing between screens. Back and optional-field states inspected. |
| `/assessments/new` | PASS | Existing-theme Talk/Type cards and preparation description rendered. No real microphone permission requested. |
| Written Assessment | PASS | Coach opening message streams without typing hello; synthetic start message stays hidden. Typed response and coach reply render in separate bubbles; avatar/title stay in one header row. Finish navigates to Report. |
| Assessment Report → Roadmap | PASS | Stub intentionally failed second Goal confirmation. First Goal stayed saved; retry confirmed only the remainder and reached Roadmap. Assertions: first Goal once, second twice, exactly one Roadmap build. Single main landmark. |
| `/roadmap` | PASS | Actual route with active/planned Units at 390px and 1440px. Badges no longer collapse/wrap mid-word; nodes, labels and headers align. Scroll width equals viewport width. Screenshot: `learner-roadmap-verification.png`. |
| Lesson teaching → blanks → teaching → blanks | PASS | Actual Lesson route at 390px. Both selected answers survived revisiting teaching. Bottom action aligned near viewport bottom; scroll width 390px. |
| Reorder | PASS | At 320px, keyboard Enter moves a row, announces position and focuses its next enabled control. No horizontal overflow. Arrow/touch clicks and correct feedback also checked in browser. |
| Feedback / voice preview | PASS | Mobile light/dark layouts, readable feedback and full-width Continue; coach, captions and mute/end controls inspected in dark mode. These voice visuals use explicit preview states; real event handling is separately tested. |
| Responsive stress | PASS | Additional 293px guide viewport had no horizontal overflow. Actual primary routes checked at 390px, desktop Roadmap at 1440px. |

## Remaining gates and limits

- BLOCKED: live microphone, audio autoplay and real provider captions/turn events were not exercised. Event parsing, interruption ordering, malformed messages, hangup cleanup, mute and dropped-call behavior are automated-test verified.
- BLOCKED: hardware/mobile keyboard, screen-reader audit, full browser Back/Forward matrix and production performance metrics were not measured. Existing SSR/auth/roleplay/settings tests passed; this is not a deployment certification.
- BLOCKED: clean-browser console proof. Chrome's installed extension injects `cz-shortcut-listen` on body and produces a hydration-attribute warning; the console diff identifies that extension attribute. No suppression was added to app code. Extension-origin WindowMode warnings also appeared. The deliberate stub HTTP failure was expected.
- N/A: deployment, external messages, new dependencies, marketing redesign, auth changes, scheduling, changed Assessment duration/recovery, mandatory onboarding gates and automatic Unit-cap removal.
- Unsubmitted drafts survive teaching Back navigation, not a browser refresh. Broader resume changes remain undecided.
- A first check against the existing local app saved one sample Job Interview Goal when the starter transition bug reproduced. It remains saved; no existing records were removed. After the fix, isolated browser assertions proved stage navigation makes no save requests.
- Other in-progress workspace changes, including mascot work, were preserved. No commits or PRs were created.
