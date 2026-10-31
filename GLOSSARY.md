# Fluently

An AI coach that helps anyone build their communication skills, for work, study, travel or everyday life. English is the only supported language today; others may follow. It assesses how a learner speaks, then builds a personalised, adaptive path of lessons.

## Language

### People and intent

**Learner**:
A person using Fluently to improve their English.
_Avoid_: User, student, candidate

**Goal**:
What the Learner wants to achieve with English, written in their own words. Examples include getting ready for a Job Interview, handling Client Calls, or speaking more easily in everyday conversations. It is set by the Learner or proposed by the agent after an Assessment.
_Avoid_: Objective, target, purpose

**Goal Context**:
What the Learner tells Fluently about their situation for a Goal, such as role, seniority, CV, job description or kind of clients.
_Avoid_: Background, bio

**Target Level**:
The CEFR Level a Goal aims for on each skill. The agent proposes it and the Learner confirms it.
_Avoid_: Target score, desired level

**Learner Brief**:
A short summary of the Learner's Goal Context that the agent uses in place of the raw pasted text.
_Avoid_: Profile, persona

### Assessment

**Assessment**:
A conversation of up to 10 minutes between the Learner and the agent that measures the Learner's spoken and written English. It is either a Voice Assessment or a Written Assessment.
_Avoid_: Interview, onboarding test, evaluation

**Voice Assessment**:
An Assessment conducted as a live spoken conversation.
_Avoid_: Real-time interview

**Written Assessment**:
An Assessment conducted as a text question-and-answer exchange.
_Avoid_: Q&A onboarding, questionnaire

**Assessment Report**:
The findings from one Assessment: skill scores, strengths and specific weaknesses, written so the Learner can read them.
_Avoid_: Result, analysis

**Skill Profile**:
The Learner's current measured ability on each skill (fluency, grammar, vocabulary). Assessments and Lessons update it.
_Avoid_: Level, stats

**CEFR Level**:
The A1–C2 band from the Common European Framework of Reference, used to label each skill in the Skill Profile.
_Avoid_: Grade, tier

**Reference Pronunciation**:
A recording of a word or phrase spoken correctly, which the Learner can play from a vocab card or a correction.
_Avoid_: Sample audio

### Learning

**Roadmap**:
The Learner's planned outline of Units and their Lesson titles and objectives, built from their Goals and Skill Profile. Titles, objectives and order stay fixed; each Lesson’s content adapts to earlier performance before it is prepared.
_Avoid_: Curriculum, course, plan

**Unit**:
One topic on the Roadmap (for example, Tenses), with its own objective, made of Lessons. A Unit completes when every outlined Lesson is completed, regardless of score, or ends when the Learner skips it.
_Avoid_: Module, chapter, lesson

**Lesson**:
One short sitting inside a Unit: Pages that teach, then a Quiz, then a choice of what's next. It completes when the Learner picks Next lesson or Learn more. Its content is prepared from earlier performance and Learner Memory, then stays fixed; Practice Rounds only add questions.
_Avoid_: Sub-lesson, class, session

**Page**:
One screen of a Lesson's learning material: a single idea of at most about 150 words in short paragraphs and bullets, with an example set apart, Key Terms, Glossary Terms and sometimes a vocab card. Pages only teach; questions come in the Quiz. A Lesson has 4–6 Pages.
_Avoid_: Slide, card, section

**Key Term**:
A phrase a Page teaches, shown in bold. Each Page has 2–4, written word for word in its body.
_Avoid_: Keyword, highlight

**Glossary Term**:
A word on a Page the Learner may not know, shown with a dotted underline that opens a short definition when tapped or focused. A Page has 0–3.
_Avoid_: Tooltip, definition, hint

**Block**:
A typed piece of a Lesson that the Learner reads or answers, such as a vocab card, a fill-in-the-gap or a reorder. Each is rendered by a fixed component. Question Blocks make up the Quiz and Practice Rounds.
_Avoid_: Widget, component, exercise

**Quiz**:
The questions at the end of a Lesson, 1–3 per Page and at most 10, answered one at a time with no feedback in between, then shown together with every result.
_Avoid_: Test, exam, assessment

**Practice Round**:
5 extra questions on a Lesson, written on request from its Pages and the Learner's wrong answers, answered like the Quiz. They count towards that Lesson's scores and XP.
_Avoid_: Extra quiz, drill, retry

**Follow-up Lesson**:
A Lesson inserted right after the current one when the Learner picks Learn more. It re-teaches the same objective aimed at their mistakes and optional note, and is required like any other Lesson. At most 2 follow one original Lesson.
_Avoid_: Remedial lesson, extra lesson, review lesson

**Step**:
A single prompt in a Lesson, together with the Learner's response and the feedback on it. A Step is either voice or text. In paged Lessons each answered Quiz or Practice Round question is saved as a Step.
_Avoid_: Exercise, question, task, sub-lesson

**Lesson Report**:
Saved feedback from one Lesson’s assessment: objective progress, measured skills and evidence, and corrections for each answer. Completing an assessment advances the Learner regardless of score.

**Learner Memory**:
An internal, bounded summary of recent demonstrated strengths, difficulties and progress used when preparing the next Lesson. Goals, Skill Profile and Focus Items remain authoritative structured context.

**Roleplay**:
A Lesson in which the agent stays in character for a real-world conversation, then ends with a Debrief. The Learner chooses a preset situation or describes their own.
_Avoid_: Simulation, scenario

**Mock Interview**:
A Roleplay in which the agent plays an interviewer for interview practice.
_Avoid_: Interview (on its own)

**Client Call**:
A Roleplay in which the agent plays a client for client work.
_Avoid_: Client meeting, sales call

**Custom Roleplay**:
A Roleplay in which the Learner describes the situation and the agent plays the other person.
_Avoid_: Free Roleplay, open scenario

**Debrief**:
The detailed feedback the Learner gets at the end of a Roleplay.
_Avoid_: Report, summary

**Focus Item**:
A specific weakness or phrase the Learner should practise, such as present perfect with since and for. It comes from an Assessment Report, a Debrief or repeated mistakes, and closes once the Learner uses it correctly enough times.
_Avoid_: Mistake, weak point, todo

### Motivation

**Streak**:
The number of consecutive local dates with a completed Lesson or a manually restored missed day. Restored days grant no XP or Lesson completion credit.

**Streak reminder**:
An email sent once, in the last 6 hours of the Learner's local day, when they have a Streak but haven't completed a Lesson yet today. Learners can turn it off from the email.

**XP**:
Points the Learner earns by completing Steps and Lessons.
_Avoid_: Score, points, credits

### Billing

**Free**:
The $0 plan: 25 live minutes per UTC calendar month and five new Lessons per local day. Pages, quizzes, resumes, reviews and retries do not consume another Lesson slot; Follow-up Lessons do.

**Pro**:
Access to unlimited daily Lesson starts, Lesson and Unit skipping, and Streak Recovery. An active paid $9 monthly subscription includes 150 live minutes per billing period. A positive Purchased Balance also unlocks Pro features.

**Minute Pack**:
A $29 one-time purchase of 500 live minutes. Packs stack, never expire and do not renew automatically. Both paid prices include tax.

**Purchased Balance**:
Unused live minutes from Minute Packs. Monthly minutes are spent first. Purchased Balance survives subscription expiry and unlocks Pro while it remains above zero.

**Streak Recovery**:
A manual Pro action restoring the latest gap of at most two missed local dates. Available once per billing period for subscribers, or once per UTC calendar month for pack-only access. Buying a pack or switching payment type does not reset an already-used recovery.
