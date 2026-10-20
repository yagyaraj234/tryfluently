# Stable Roadmap outlines; prepare one Lesson at a time

Updated 19 October 2026. Partly superseded by [0003](0003-paged-lessons-generated-on-start.md).

After an Assessment and Goal confirmation, generate the full Roadmap of Units and Lesson titles/objectives. Outlines stay stable across performance changes and Assessment retakes. Existing outline sizes remain 3–5 practice Lessons per Unit, with an optional final Roleplay.

Prepare only the immediate next Lesson: explanations, examples, useful phrases, and 3–5 assessment questions. The first Lesson is prepared when the Roadmap is built. Later Lessons are prepared after completion commits, using Goals, Skill Profile, open Focus Items and Learner Memory across Unit boundaries. Prepared material and questions are immutable. Preparation does not earn XP or Streak or start study time.

The Learner reads material, explicitly starts the assessment, answers every question, and receives a saved Lesson Report. Answers survive refresh and failed judging. A successfully judged assessment completes the Lesson regardless of score. Every outlined Lesson must complete before the Unit completes; there is no early mastery threshold or 15-Lesson cap. Skipping remains explicit. Optional Roleplays keep their live adaptive conversation and saved Debrief, and occur after the outlined practice Lessons.

Completion, report, scores, Focus Items, Learner Memory and Unit advancement commit together under a Learner lock. Automatic next-Lesson preparation follows that commit. Failed preparation is persisted and retryable through the next-Lesson action, without undoing completion. Generation runs outside transactions; a token and two-minute lease prevent duplicate content writes and allow recovery after process interruption. Assessment completion commits pending email and practice jobs alongside its Report, then returns immediately. A worker in the Bun API process runs those jobs with renewable leases, up to three attempts and restart recovery. The UI polls practice status every three seconds until ready or failed; manual retry requeues failed practice without regenerating the Report. Other Lesson preparation continues through the existing request flow.

Learner Memory stores up to eight compact evidence summaries from Assessments, Lessons and Roleplays. It does not copy raw Goal Context or full transcripts. This keeps context bounded without an additional model call; structured scores and Focus Items retain longer-lived learning signals.

Completed history and in-progress legacy chat Lessons remain readable/resumable. Roadmaps missing outlines receive future outlines through the existing backfill action without replacing their practice history; outlined future Lessons use the prepared format. Historical missing reports are shown as unavailable rather than regenerated.

Progress exposes completion counts and weekly activity separately from skill scores. Saved Assessment Reports, Lesson Reports and Roleplay Debriefs are available from Progress. A dedicated Roleplays page lists standalone and Roadmap conversations, their status, saved feedback and conversation history.

## Superseded decisions

- Generate Steps dynamically within each practice Lesson.
- Revise future Unit/Lesson outlines after performance changes.
- Advance early after two Lessons at 80+, or stop after 15 Lessons.

Dynamic conversation remains appropriate for Assessments and Roleplays.
