import { schema, type Tx } from "@fluently/db";
import { Output } from "ai";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";
import { generate } from "./ai";
import type { Deps } from "./app";
import {
  hasPhrase,
  publicQuestion,
  questionBlocks,
  questionProblem,
  questionsOutput,
  type Question,
} from "./lesson-blocks";
import { waitForAnalysis, type Clock } from "./lesson-analysis";
import { answeredPages } from "./page-answers";
import { followUpBrief } from "./follow-up-lessons";
import { skillProfile } from "./scoring";
import { claimLesson } from "./billing-credits";

const { lesson, unit, goal, focusItem, learnerMemory, assessmentJob: job } = schema;
type Ctx = Pick<Deps, "db" | "now" | "models"> & { signal?: AbortSignal; clock?: Clock };

export const blockTypes = [
  "reading",
  "vocabCard",
  "fillGap",
  "multipleChoice",
  "matchPairs",
  "reorder",
  "rewrite",
  "speakPrompt",
] as const;
/** Blocks the Quiz can ask. Vocab cards teach on a Page instead. */
export const quizBlocks = ["fillGap", "multipleChoice", "matchPairs", "reorder", "rewrite", "speakPrompt"] as const;
const needsKey = new Set<string>(["fillGap", "multipleChoice", "matchPairs", "reorder"]);
const DEFAULT_PAGES = 5;
const WORD_CAP = 150;
const MAX_RETRIES = 2;
/** Content version of Lessons created now: Pages that only teach, then a Quiz. */
export const QUIZ_VERSION = 3;
const MAX_QUIZ = 10;

const text = z.string().trim().min(1).max(2000);
// focus is the one thing the Learner can do by the end; keyExample is one shared scenario so Pages do not clash.
export const planOutput = z.object({
  focus: text,
  keyExample: text.nullable(),
  pages: z.array(z.object({ idea: text, block: z.enum(blockTypes) })).min(1),
});
// Content version 3: each Page teaches one idea, maybe with a vocab card, and gets 1-3 Quiz questions.
export const quizPlanOutput = z.object({
  focus: text,
  keyExample: text.nullable(),
  pages: z.array(z.object({ idea: text, vocabCard: z.boolean(), questions: z.array(z.enum(quizBlocks)) })).min(1),
});
const vocabOutput = z.object({ term: text, meaning: text });
// answerKey is what the later question for this Page is graded on; it is never sent to the Learner.
// keyTerms (shown bold) and glossary terms (shown with a definition) must appear word for word in the body.
export const pageOutput = z.object({
  title: text,
  body: text,
  example: text.nullable(),
  answerKey: text.nullable(),
  keyTerms: z.array(text),
  glossary: z.array(z.object({ term: text, definition: text })),
});
type PageOutput = z.infer<typeof pageOutput>;
// A Page of content version 3 has no answerKey; its vocab card is the term it teaches with a plain meaning.
export const teachingPageOutput = pageOutput.omit({ answerKey: true }).extend({ vocab: vocabOutput.nullable() });

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Cheap rules on top of the schema. Returns a reason, or undefined when the Page is fine.
 * `others` are the other Pages' planned ideas and whichever of them are already written. */
export function pageProblem(
  page: PageOutput,
  block: string,
  others: { ideas: string[]; written: PageOutput[] } = { ideas: [], written: [] },
) {
  if (words(`${page.body} ${page.example ?? ""}`) > WORD_CAP) return `over ${WORD_CAP} words`;
  if (page.keyTerms.length < 2 || page.keyTerms.length > 4) return "needs 2 to 4 Key Terms";
  if (page.glossary.length > 3) return "at most 3 Glossary Terms";
  const missing = page.keyTerms.find((t) => !hasPhrase(page.body, t));
  if (missing) return `Key Term ${JSON.stringify(missing)} is not in the body`;
  const unknown = page.glossary.find((g) => !hasPhrase(page.body, g.term));
  if (unknown) return `Glossary Term ${JSON.stringify(unknown.term)} is not in the body`;
  const key = page.answerKey?.trim();
  if (needsKey.has(block) && !key) return "missing answerKey";
  if (key) {
    if (hasPhrase(`${page.title} ${page.body} ${page.example ?? ""}`, key)) return "answerKey appears in the reading";
  }
  const title = norm(page.title);
  if (others.ideas.some((x) => norm(x) === title) || others.written.some((x) => norm(x.title) === title))
    return "title repeats another Page";
  const same = (x?: string | null) => !!key && !!x && norm(x) === norm(key);
  if (others.ideas.some(same) || others.written.some((x) => same(x.answerKey))) return "answerKey repeats another Page";
}

// `idea` (with `block`, or `vocabCard` and `questions` in version 3) is the plan slice, kept so a failed Page can be
// written again without planning the whole Lesson again.
type Stored = PageOutput & {
  block: string;
  idea?: string;
  focus?: string;
  keyExample?: string | null;
  question?: Question;
  vocabCard?: boolean;
  questions?: string[];
  vocab?: z.infer<typeof vocabOutput> | null;
};
const blank = { title: "", body: "", example: null };
type LessonRow = typeof lesson.$inferSelect;
type StepRow = typeof schema.step.$inferSelect;

/** What a Learner may see: no answer keys. Pending Pages are listed without content. */
export function publicPages(l: LessonRow, steps: StepRow[] = []) {
  const quiz = l.contentVersion === QUIZ_VERSION;
  const answered = quiz ? new Map() : answeredPages(l, steps);
  return (l.pageStatus ?? []).map((s, i) => {
    const page = l.material?.[i] as Stored | undefined;
    return {
      page: i,
      status: s.page,
      question: s.question,
      ...(answered.has(i) && { result: answered.get(i) }),
      ...(!quiz && s.question === "ready" && page?.question && { questionData: publicQuestion(page.question) }),
      ...(s.page === "ready" &&
        page && {
          title: page.title,
          body: page.body,
          example: page.example,
          ...(!quiz && { block: page.block }),
          // Pages written before Key Terms existed have none and keep their plain reading.
          ...(page.keyTerms && { keyTerms: page.keyTerms, glossary: page.glossary ?? [] }),
          ...(page.vocab && { vocab: page.vocab }),
        }),
    };
  });
}

/** The Quiz and Practice Round questions as the Learner may see them, each with its saved result once answered. */
export function publicQuiz(l: LessonRow, steps: StepRow[] = []) {
  const answered = answeredPages(l, steps);
  return (l.quiz ?? []).map((q, i) => ({
    index: i,
    page: q.page,
    round: q.round,
    questionData: publicQuestion(q.question as Question),
    ...(answered.has(i) && { result: answered.get(i) }),
  }));
}

const pending = (n: number) =>
  Array.from({ length: n }, () => ({ page: "pending" as const, question: "pending" as const }));

/** Reserves the Learner's next outlined Lesson and queues its generation. Starting twice returns the same Lesson. */
export async function startLesson({ db, now }: { db: Tx; now: Deps["now"] }, userId: string, position: number) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    const [active] = await tx
      .select()
      .from(unit)
      .where(and(eq(unit.userId, userId), eq(unit.status, "active")));
    const planned = active?.lessonOutline.find((p) => p.position === position);
    if (!active || !planned) return { error: "That Lesson isn't in your active Unit" as const };
    if (planned.kind !== "practice") return { error: "Roleplays start from the Roadmap" as const };
    const rows = await tx.select().from(lesson).where(eq(lesson.unitId, active.id)).orderBy(asc(lesson.position));
    const existing = rows.find((l) => l.position === position);
    if (existing?.status === "skipped")
      return { error: "This Lesson was skipped. Continue to the next Lesson." as const };
    if (existing)
      return existing.contentVersion >= 2 ? { lesson: existing } : { error: "Lesson already prepared" as const };
    const next = active.lessonOutline.find(
      (p) => !rows.some((l) => l.position === p.position && (l.status === "completed" || l.status === "skipped")),
    );
    if (next?.position !== position) return { error: "Finish your earlier Lessons first" as const };
    await claimLesson(tx, userId, now());
    // Outlines written before pageCount existed have none: they get the default.
    const pages = (planned as { pageCount?: number }).pageCount ?? DEFAULT_PAGES;
    const [created] = await tx
      .insert(lesson)
      .values({
        userId,
        unitId: active.id,
        position,
        kind: "practice",
        title: planned.title,
        objective: planned.objective,
        phase: "learning",
        contentVersion: QUIZ_VERSION,
        preparation: "preparing",
        preparationToken: crypto.randomUUID(),
        preparationAt: now(),
        pageStatus: pending(pages),
        material: Array.from({ length: pages }, () => blank),
        startedAt: now(),
      })
      .returning();
    await tx
      .insert(job)
      .values({ lessonId: created!.id, userId, kind: "lesson", availableAt: now() })
      .onConflictDoNothing();
    return { lesson: created!, created: true };
  });
}

/** Checks the Quiz writer's questions against the plan and puts them in Page order. Returns a reason when they don't fit. */
function quizFromPlan(planned: string[][], questions: z.infer<typeof questionsOutput>["questions"]) {
  const left = [...questions];
  const quiz: { page: number; round: number; question: Question }[] = [];
  for (const [page, blocks] of planned.entries()) {
    for (const block of blocks) {
      const at = left.findIndex((q) => q.page === page && q.question.block === block);
      if (at < 0) return `Page ${page + 1} is missing its ${block} question`;
      const question = left.splice(at, 1)[0]!.question as Question;
      const problem = questionProblem(question);
      if (problem) return `Page ${page + 1} ${block} question rejected: ${problem}`;
      quiz.push({ page, round: 0, question });
    }
  }
  return quiz;
}

/** Writes the whole Quiz in one call from the finished Pages and the planned questions. Retries alone, twice at most. */
async function writeQuiz(ctx: Ctx, lessonId: string, token: string) {
  const { db, models } = ctx;
  const mine = and(eq(lesson.id, lessonId), eq(lesson.preparationToken, token));
  const [row] = await db.select().from(lesson).where(mine);
  if (!row) return;
  const material = row.material as Stored[];
  const pages = material.map((p, i) => ({
    page: i,
    title: p.title,
    body: p.body,
    example: p.example,
    vocab: p.vocab ?? null,
    questions: p.questions ?? [],
  }));
  const settle = (set: Partial<LessonRow>, question: "ready" | "failed") =>
    db.transaction(async (tx) => {
      const [cur] = await tx.select().from(lesson).where(mine).for("update");
      if (!cur) return;
      const pageStatus = cur.pageStatus!.map((s) => ({ ...s, question }));
      await tx
        .update(lesson)
        .set({ ...set, pageStatus, preparationToken: null })
        .where(eq(lesson.id, lessonId));
    });
  let feedback = "";
  for (let tries = 0; tries <= MAX_RETRIES; tries++) {
    try {
      const { output } = await generate(ctx, row.userId, {
        model: models.step,
        reasoning: "low",
        abortSignal: ctx.signal,
        instructions: `Write the Quiz for the end of an English Lesson. For each Page write exactly the questions listed in its "questions", in that order, each with that "block" and the Page's index as "page" (0-based). Each question tests only that Page's idea, never copying a sentence from the reading. Give the exact answer and a one or two sentence explanation so answers can be graded with no AI later. A fillGap prompt has exactly one "___" and never contains its answer. For rewrite and speakPrompt give the prompt, an expectedAnswer and a short rubric instead. Plain text only: no markdown or asterisks.${feedback}`,
        prompt: JSON.stringify({ lesson: row.title, objective: row.objective, pages }),
        output: Output.object({ schema: questionsOutput }),
      });
      const quiz = quizFromPlan(
        pages.map((p) => p.questions),
        questionsOutput.parse(output).questions,
      );
      if (typeof quiz === "string") {
        console.error(`Lesson ${lessonId} Quiz attempt ${tries + 1} rejected: ${quiz}`);
        feedback = ` Your previous attempt was rejected: ${quiz}. Fix that this time.`;
        continue;
      }
      return void (await settle({ quiz, preparation: "ready" }, "ready"));
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      console.error(`Lesson ${lessonId} Quiz attempt ${tries + 1} failed`, error);
    }
  }
  await settle({ preparation: "failed" }, "failed");
}

/** Writes the question for every interactive Page in one call, after all Pages are ready. Retries alone, twice at most. */
async function writeQuestions(ctx: Ctx, lessonId: string, token: string) {
  const { db, models } = ctx;
  const mine = and(eq(lesson.id, lessonId), eq(lesson.preparationToken, token));
  const [row] = await db.select().from(lesson).where(mine);
  if (!row) return;
  const plan = (row.material as Stored[]).map((p, i) => ({
    page: i,
    block: p.block,
    title: p.title,
    body: p.body,
    example: p.example,
    answerKey: p.answerKey,
  }));
  // Pages that already hold a ready question (and maybe a saved answer) are never rewritten.
  const wanted = plan
    .filter((p) => questionBlocks.includes(p.block) && row.pageStatus![p.page]?.question !== "ready")
    .map((p) => p.page);
  for (let tries = 0; tries <= MAX_RETRIES; tries++) {
    try {
      const byPage = new Map<number, Question>();
      if (wanted.length) {
        const { output } = await generate(ctx, row.userId, {
          model: models.step,
          reasoning: "low",
          abortSignal: ctx.signal,
          instructions: `Write the questions for an English Lesson, one per Page whose block is not "reading" (pages ${wanted.join(", ")}, 0-based). Each question's "block" must match the Page's block and test only that Page's idea, using its answerKey when given. Give the exact answer and a one or two sentence explanation so answers can be graded with no AI later. A fillGap prompt has exactly one "___". A vocabCard answer is the term's meaning in plain English, never the term itself. For rewrite and speakPrompt give the prompt, an expectedAnswer and a short rubric instead. Plain text only: no markdown or asterisks.`,
          prompt: JSON.stringify({ lesson: row.title, pages: plan }),
          output: Output.object({ schema: questionsOutput }),
        });
        for (const q of questionsOutput.parse(output).questions) byPage.set(q.page, q.question);
        for (const i of wanted) {
          const q = byPage.get(i);
          if (!q || q.block !== plan[i]!.block) throw new Error(`Page ${i + 1} question missing or wrong Block`);
          const problem = questionProblem(q);
          if (problem) throw new Error(`Page ${i + 1} question rejected: ${problem}`);
        }
      }
      await db.transaction(async (tx) => {
        const [cur] = await tx.select().from(lesson).where(mine).for("update");
        if (!cur) return;
        const material = (cur.material as Stored[]).map((p, i) =>
          wanted.includes(i) ? { ...p, question: byPage.get(i)! } : p,
        );
        const pageStatus = cur.pageStatus!.map((s) => ({ ...s, question: "ready" as const }));
        await tx
          .update(lesson)
          .set({ material, pageStatus, preparation: "ready", preparationToken: null })
          .where(eq(lesson.id, lessonId));
      });
      return;
    } catch (error) {
      if (ctx.signal?.aborted) throw error;
      console.error(`Lesson ${lessonId} questions attempt ${tries + 1} failed`, error);
    }
  }
  await db.transaction(async (tx) => {
    const [cur] = await tx.select().from(lesson).where(mine).for("update");
    if (!cur) return;
    const pageStatus = cur.pageStatus!.map((s, i) => ({
      ...s,
      question: wanted.includes(i) ? ("failed" as const) : ("ready" as const),
    }));
    await tx
      .update(lesson)
      .set({ preparation: "failed", preparationToken: null, pageStatus })
      .where(eq(lesson.id, lessonId));
  });
}

/**
 * Failed Lessons and unfinished Lessons without runnable work retry only Pages that are not ready.
 * Ready Pages keep their content, question and saved answers. Without a usable plan the whole Lesson starts over.
 */
export async function retryLesson({ db, now }: Pick<Deps, "db" | "now">, userId: string, lessonId: string) {
  return db.transaction(async (tx) => {
    const [l] = await tx
      .select()
      .from(lesson)
      .where(
        and(
          eq(lesson.id, lessonId),
          eq(lesson.userId, userId),
          gte(lesson.contentVersion, 2),
          eq(lesson.status, "in_progress"),
        ),
      )
      .for("update");
    if (!l) return;
    if (l.preparation !== "failed") {
      if (l.preparation !== "preparing") return;
      const [work] = await tx
        .select({ status: job.status })
        .from(job)
        .where(and(eq(job.lessonId, l.id), eq(job.kind, "lesson")))
        .for("update");
      if (work?.status === "pending" || work?.status === "running") return;
    }
    const old = l.material as Stored[];
    const redo = l.pageStatus!.flatMap((s, i) => (s.page === "ready" ? [] : [i]));
    const all =
      redo.length === l.pageStatus!.length || redo.some((i) => !old[i]?.idea || !(old[i]?.block ?? old[i]?.questions));
    const regen = (i: number) => all || redo.includes(i);
    // An answer to a Page that is written again would be an answer to a different question: drop it with the Page.
    const gone = all ? [] : [inArray(schema.step.position, redo)];
    if (all || redo.length) await tx.delete(schema.step).where(and(eq(schema.step.lessonId, l.id), ...gone));
    const [row] = await tx
      .update(lesson)
      .set({
        preparation: "preparing",
        preparationToken: crypto.randomUUID(),
        preparationAt: now(),
        pageStatus: l.pageStatus!.map((s, i) =>
          regen(i) ? { page: "pending" as const, question: "pending" as const } : s,
        ),
        material: old.map((p, i) =>
          regen(i)
            ? {
                ...blank,
                ...(!all && { idea: p.idea, block: p.block, vocabCard: p.vocabCard, questions: p.questions }),
              }
            : p,
        ),
      })
      .where(eq(lesson.id, l.id))
      .returning();
    await tx
      .insert(job)
      .values({ lessonId: l.id, userId, kind: "lesson", availableAt: now() })
      .onConflictDoUpdate({
        target: [job.lessonId, job.kind],
        set: { status: "pending", attempts: 0, availableAt: now(), token: null, lockedAt: null },
      });
    return row;
  });
}

const levelHint = (profile: Awaited<ReturnType<typeof skillProfile>>) => {
  const levels = Object.entries(profile).flatMap(([skill, v]) => (v ? [`${skill} ${v.level}`] : []));
  return levels.length ? `Learner level: ${levels.join(", ")}. Match it.` : "Learner level unknown: aim for B1.";
};

/** Runs one `lesson` job: planner, then every Page writer in parallel. Pages land as they finish. */
export async function generateLesson(ctx: Ctx, lessonId: string, attempt: number) {
  const { db, models } = ctx;
  const [row] = await db.select().from(lesson).where(eq(lesson.id, lessonId));
  if (!row || row.contentVersion < 2 || !row.preparationToken) return;
  const quiz = row.contentVersion === QUIZ_VERSION;
  // "ready" with a token means every Page is written but the questions are not: a resumed job goes straight to them.
  if (row.preparation !== "preparing" && row.preparation !== "ready") return;
  const token = row.preparationToken;
  const total = row.pageStatus!.length;
  const mine = and(eq(lesson.id, lessonId), eq(lesson.preparationToken, token));
  const fail = (failedPages: boolean[] = []) =>
    db.transaction(async (tx) => {
      const [cur] = await tx.select().from(lesson).where(mine).for("update");
      if (!cur) return;
      await tx
        .update(lesson)
        .set({
          preparation: "failed",
          preparationToken: null,
          pageStatus: cur.pageStatus!.map((s, i) => (failedPages[i] ? { ...s, page: "failed" as const } : s)),
        })
        .where(eq(lesson.id, lessonId));
    });
  try {
    // Pages still to write: all of them on a first run, only the failed ones on a retry.
    const todo = row.pageStatus!.flatMap((s, i) => (s.page === "ready" ? [] : [i]));
    if (!todo.length) return void (await (quiz ? writeQuiz : writeQuestions)(ctx, lessonId, token));
    const base = { model: models.step, reasoning: "low" as const, abortSignal: ctx.signal };
    let slices = row.material as Stored[];
    let hint: string;
    // The plan's focus and shared example are kept on the Pages too, so a retry writes to the same brief.
    let lessonFocus = slices[0]?.focus;
    let keyExample = slices[0]?.keyExample;
    // On a retry the Pages already written count as "written", so a new Page can't repeat them.
    const written: PageOutput[] = [];
    slices.forEach((p, i) => {
      if (row.pageStatus![i]!.page === "ready") written[i] = p;
    });
    if (todo.length < total) hint = levelHint(await skillProfile(db, row.userId));
    else {
      // The last Lesson's analysis feeds this plan; give it a few seconds, then go on with what exists.
      await waitForAnalysis(db, row.userId, { clock: ctx.clock });
      const [[active], goals, focus, memory, profile, followUp] = await Promise.all([
        db.select().from(unit).where(eq(unit.id, row.unitId!)),
        db
          .select({ statement: goal.statement, brief: goal.brief, targetLevels: goal.targetLevels })
          .from(goal)
          .where(and(eq(goal.userId, row.userId), eq(goal.status, "confirmed"))),
        db
          .select({ label: focusItem.label })
          .from(focusItem)
          .where(and(eq(focusItem.userId, row.userId), eq(focusItem.status, "open"))),
        db.select().from(learnerMemory).where(eq(learnerMemory.userId, row.userId)),
        skillProfile(db, row.userId),
        quiz ? followUpBrief(db, row) : undefined,
      ]);
      const each = quiz
        ? `Each Page only teaches one idea; set "vocabCard" when a key word or phrase on it deserves a vocab card. Give each Page 1-3 "questions" for the end-of-Lesson Quiz (${quizBlocks.join(", ")}), more where the idea is dense or the Learner is weak on that skill, and at most ${MAX_QUIZ} in the whole Lesson.`
        : `Each Page teaches one idea and uses one Block type (${blockTypes.join(", ")}).`;
      const again = followUp
        ? ` This is a Follow-up Lesson: re-teach the same objective from a different angle than the Lesson before it, aimed at the Learner's mistakes there and their note on what confused them.`
        : "";
      const { output: plan } = await generate(ctx, row.userId, {
        ...base,
        instructions: `Plan one short English Lesson of exactly ${total} Pages.${again} ${each} Give the Lesson one through-line and a "focus": one sentence on the single thing the Learner can do by the end. Pick a "keyExample", one short scenario every Page reuses. One distinct idea per Page, no filler Pages, nothing repeated. Build up from simple to practised, never drifting off the Lesson title and objective, and adapt to the Learner's evidence, Focus Items and memory.`,
        prompt: JSON.stringify({
          unit: { title: active?.title, objective: active?.objective },
          lesson: { title: row.title, objective: row.objective },
          goals,
          skillProfile: profile,
          focusItems: focus.map((f) => f.label),
          learnerMemory: memory[0]?.summary ?? "",
          ...(followUp && { followUp }),
        }),
        output: quiz ? Output.object({ schema: quizPlanOutput }) : Output.object({ schema: planOutput }),
      });
      const parsed = (quiz ? quizPlanOutput : planOutput).parse(plan);
      const pages = parsed.pages as Stored[];
      if (pages.length !== total) throw new Error(`Planner returned ${pages.length} Pages, wanted ${total}`);
      if (quiz) {
        const counts = pages.map((p) => p.questions!.length);
        if (counts.some((n) => n < 1 || n > 3)) throw new Error("Planner gave a Page other than 1-3 questions");
        if (counts.reduce((a, b) => a + b, 0) > MAX_QUIZ) throw new Error(`Planner asked over ${MAX_QUIZ} questions`);
      }
      if (new Set(pages.map((p) => norm(p.idea!))).size !== total) throw new Error("Planner repeated a Page idea");
      lessonFocus = parsed.focus;
      keyExample = parsed.keyExample;
      hint = levelHint(profile);
      slices = pages;
      // Keep the plan next to each Page so a failed one can be written again alone.
      await db.transaction(async (tx) => {
        const [cur] = await tx.select().from(lesson).where(mine).for("update");
        if (!cur) return;
        const material = pages.map((p, i) => ({
          ...(cur.material![i] as Stored),
          idea: p.idea,
          block: p.block,
          vocabCard: p.vocabCard,
          questions: p.questions,
          focus: lessonFocus,
          keyExample,
        }));
        await tx.update(lesson).set({ material }).where(eq(lesson.id, lessonId));
      });
    }
    const ideas = slices.map((p) => p.idea!);

    // Each writer sees the whole plan and the focus, but writes only its own idea. A Page that fails its checks retries alone.
    const write = async (i: number) => {
      // Version 3 writers get only the idea, so the Page teaches rather than restating an exercise.
      const slice = quiz
        ? { idea: slices[i]!.idea!, vocabCard: Boolean(slices[i]!.vocabCard) }
        : { idea: slices[i]!.idea!, block: slices[i]!.block };
      const task = quiz
        ? `Cover only your idea.${slice.vocabCard ? ` Add a "vocab" card: the key word or phrase of this Page with its plain meaning.` : ` Set "vocab" to null.`} Teach it; the questions come later in a Quiz.`
        : `Cover only your idea, for this Block type: ${slice.block}.`;
      const answerKeyRule = quiz
        ? ""
        : ` The reading must teach without containing the answerKey, the exact word or phrase the Learner will later be asked for (null for reading, vocabCard, rewrite and speakPrompt).`;
      // Tells the next attempt why the last one was rejected, so it does not repeat the same mistake.
      let feedback = "";
      for (let tries = 0; tries <= MAX_RETRIES; tries++) {
        try {
          const { output } = await generate(ctx, row.userId, {
            ...base,
            instructions: `Write one Page of an English Lesson in at most ${WORD_CAP} words in total. ${hint} You write Page ${i + 1} of ${total}. ${task} The other Pages cover the rest, so do not repeat them. Stay on the Lesson focus and reuse the keyExample. Plain text only: no markdown, asterisks or underscores for emphasis. Split the body into short paragraphs separated by a blank line; a line starting with "- " is a bullet. Give 2-4 keyTerms, the phrases this Page teaches, and up to 3 glossary entries for words the Learner may not know, each with a short plain definition; every keyTerm and glossary term must appear word for word in the body. The "example" is a model sentence to read, never an exercise or instruction.${answerKeyRule}${feedback}`,
            prompt: JSON.stringify({
              lesson: row.title,
              focus: lessonFocus,
              keyExample,
              allIdeas: ideas,
              page: i + 1,
              of: total,
              ...slice,
            }),
            output: quiz ? Output.object({ schema: teachingPageOutput }) : Output.object({ schema: pageOutput }),
          });
          const page = quiz
            ? { answerKey: null, ...teachingPageOutput.parse(output) }
            : { ...pageOutput.parse(output), vocab: undefined };
          const problem =
            quiz && slice.vocabCard && !page.vocab
              ? "missing the vocab card"
              : pageProblem(page, quiz ? "reading" : slices[i]!.block, {
                  ideas: ideas.filter((_, j) => j !== i),
                  written: written.filter((_, j) => j !== i),
                });
          if (problem) {
            const key = page.answerKey ? ` (answerKey ${JSON.stringify(page.answerKey)})` : "";
            console.error(`Lesson ${lessonId} page ${i + 1} attempt ${tries + 1} rejected: ${problem}${key}`);
            feedback = ` Your previous attempt was rejected: ${problem}${key}. Fix that this time: if the answerKey appeared in the reading, rephrase the reading or choose a different answerKey; if a term is not in the body, use it in the body word for word or drop it.`;
            continue;
          }
          written[i] = page;
          await db.transaction(async (tx) => {
            const [cur] = await tx.select().from(lesson).where(mine).for("update");
            if (!cur) return;
            const material = [...(cur.material ?? [])];
            material[i] = { ...(material[i] as Stored), ...page, block: slices[i]!.block, idea: slice.idea } as Stored;
            const pageStatus = cur.pageStatus!.map((s, j) => (j === i ? { ...s, page: "ready" as const } : s));
            const done = pageStatus.every((s) => s.page === "ready");
            await tx
              .update(lesson)
              .set({ material, pageStatus, ...(done && { preparation: "ready" }) })
              .where(eq(lesson.id, lessonId));
          });
          return true;
        } catch (error) {
          if (ctx.signal?.aborted) throw error;
          console.error(`Lesson ${lessonId} page ${i + 1} attempt ${tries + 1} failed`, error);
        }
      }
      return false;
    };
    const ok = await Promise.all(todo.map(write));
    if (ok.includes(false)) await fail(row.pageStatus!.map((_, i) => ok[todo.indexOf(i)] === false));
    else await (quiz ? writeQuiz : writeQuestions)(ctx, lessonId, token);
  } catch (error) {
    // Planner or database trouble: the job retries, and its last attempt fails the Lesson.
    if (attempt >= 3) await fail();
    throw error;
  }
}
