import { schema, type Skill } from "@fluently/db";
import { NoObjectGeneratedError, Output, type UIMessage } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { generate } from "./ai";
import type { Deps } from "./app";
import { remember, advanceUnit, addFocusItems } from "./learning-memory";
import { fluencyScore, recordScores, skillProfile, skills, speechSegments } from "./scoring";

const { lesson, step, unit } = schema;
type Ctx = Pick<Deps, "db" | "now" | "models"> & { settings: { alphaLesson: number } };

const skillResult = z.object({ score: z.number().min(0).max(100), evidence: z.array(z.string()) });

// What the judge returns after each Lesson: only the skills it saw evidence for are scored.
export const judgeOutput = z.object({
  skills: z.object({
    fluency: skillResult.nullable(),
    grammar: skillResult.nullable(),
    vocabulary: skillResult.nullable(),
  }),
  objectiveProgress: z.number().int().min(0).max(100),
  summary: z.string(),
  focusItems: z.array(z.object({ label: z.string(), kind: z.enum(["grammar", "vocabulary", "phrase"]) })).nullable(),
});

const preparedJudgeOutput = judgeOutput.extend({
  feedback: z
    .array(
      z.object({
        position: z.number().int().min(0),
        verdict: z.enum(["correct", "almost", "incorrect"]),
        corrected: z.string(),
        explanation: z.string(),
      }),
    )
    .min(3)
    .max(5),
});

const judgeInstructions = `You are an examiner for English as a second language. Judge one finished Lesson from its Steps:
what the Learner was asked, what they answered and the feedback they got. Using the official CEFR descriptors, score
0–100 only the skills (fluency, grammar, vocabulary) the Learner showed evidence of, with quotes; set every other skill to null. Rate progress on the
Lesson objective 0–100, and write a two-sentence summary that the next Lesson can build on.
If the Learner made the same mistake more than once, add it as a Focus Item with a short label and its kind.
Score fluency only from voice Steps (mode "voice"), using their timing (words per minute) and how smoothly they flow.`;

export const debriefOutput = z.object({
  overallImpression: z.string(),
  // One entry per main question; its follow-ups belong to it.
  questions: z
    .array(
      z.object({
        question: z.string(),
        quote: z.string(),
        strongerPhrasing: z.string(),
        languageIssues: z.array(z.string()),
      }),
    )
    .min(1),
  skills: z.object({
    fluency: skillResult.nullable(),
    grammar: skillResult.nullable(),
    vocabulary: skillResult.nullable(),
  }),
  phrasesToLearn: z.array(z.string()).length(3),
  objectiveProgress: z.number().int().min(0).max(100),
  summary: z.string(),
});

const debriefInstructions = `You are an examiner for English as a second language. Read a Roleplay transcript and write
the Learner's Debrief. Judge their English only, never whether their technical or business answers are correct.
Give an overall impression. For each main question the Learner was asked (group follow-ups with their question), quote
what they said, give a stronger phrasing and list the language issues. Using the official CEFR descriptors, score 0–100
the skills (grammar, vocabulary, and fluency as how coherent and connected their speech is) they showed evidence of; set every other skill to null.
Give exactly 3 phrases to learn, rate how well they met the objective 0–100, and write a two-sentence summary.`;

const textOf = (messages: UIMessage[]) =>
  messages
    .map(
      (m) =>
        `${m.role === "user" ? "Learner" : "Character"}: ${m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ")}`,
    )
    .join("\n");

// Judging stays outside the transaction; completion and all learning results commit together.
export async function completeLesson({ db, now, models, settings }: Ctx, id: string, userId: string) {
  const [row] = await db
    .select()
    .from(lesson)
    .where(and(eq(lesson.id, id), eq(lesson.userId, userId)));
  if (!row) throw new Error("Lesson not found");
  if (row.status !== "in_progress") return { status: row.status, debrief: row.debrief };

  const transcript = row.messages as UIMessage[];
  const abandoned = row.kind === "roleplay" && !transcript.some((m) => m.role === "user");
  let judged:
    z.infer<typeof judgeOutput> | z.infer<typeof debriefOutput> | z.infer<typeof preparedJudgeOutput> | undefined;
  let scores: Partial<Record<Skill, number>> = {};
  const startedAt = now();
  if (!abandoned) {
    const [steps, [u]] = await Promise.all([
      db
        .select({
          position: step.position,
          type: step.type,
          mode: step.mode,
          input: step.input,
          output: step.output,
          feedback: step.feedback,
          timing: step.timing,
        })
        .from(step)
        .where(eq(step.lessonId, id))
        .orderBy(asc(step.position)),
      row.unitId
        ? db.select({ objective: unit.objective, skills: unit.skills }).from(unit).where(eq(unit.id, row.unitId))
        : [],
    ]);
    if (row.preparation && (!steps.length || steps.some((s) => !s.output))) return { status: "failed" as const };
    try {
      if (row.kind === "roleplay") {
        ({ output: judged } = await generate({ db, now }, userId, {
          model: models.judge,
          instructions: debriefInstructions,
          prompt: `${row.title} (${row.tone}). Objective: ${row.objective}\n\n${textOf(transcript)}`,
          output: Output.object({ schema: debriefOutput }),
        }));
      } else {
        ({ output: judged } = await generate({ db, now }, userId, {
          model: models.judge,
          instructions:
            judgeInstructions +
            (row.preparation
              ? " Return feedback for every Step, keyed by its zero-based position. Preserve server-graded verdicts."
              : ""),
          prompt: JSON.stringify({ lesson: { objective: row.objective }, unit: u, steps }),
          output: Output.object({ schema: row.preparation ? preparedJudgeOutput : judgeOutput }),
        }));
      }
    } catch (e) {
      if (!NoObjectGeneratedError.isInstance(e)) throw e;
      if (row.kind === "roleplay" || row.preparation) return { status: "failed" as const };
      // A malformed practice judgement still completes the Lesson without moving skills or its Unit.
      console.error("lesson judge failed", e);
    }
    if (row.preparation && judged && !("feedback" in judged)) return { status: "failed" as const };
    if (
      judged &&
      "feedback" in judged &&
      (judged.feedback.length !== steps.length ||
        new Set(judged.feedback.map((f) => f.position)).size !== steps.length ||
        judged.feedback.some((f) => f.position >= steps.length))
    )
      return { status: "failed" as const };
    if (judged) {
      scores = Object.fromEntries(Object.entries(judged.skills).flatMap(([s, r]) => (r ? [[s, r.score]] : [])));
      if (row.kind === "roleplay") {
        const fluency =
          !row.textMode && judged.skills.fluency
            ? fluencyScore(speechSegments(transcript), judged.skills.fluency.score)
            : null;
        if (fluency === null) delete scores.fluency;
        else scores.fluency = fluency;
      } else if (!steps.some((s) => s.mode === "voice")) delete scores.fluency;
      if (!("fluency" in scores)) judged = { ...judged, skills: { ...judged.skills, fluency: null } };
    }
  }

  const at = row.kind === "practice" ? startedAt : now();
  const result = await db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    // shortcut: concurrent ends may judge twice, add a durable claim if duplicate model spend matters.
    const [current] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, id), eq(lesson.userId, userId)))
      .for("update");
    if (!current) throw new Error("Lesson not found");
    if (current.status !== "in_progress") return { row: current, changed: false };
    if (abandoned) {
      const [saved] = await tx.update(lesson).set({ status: "abandoned" }).where(eq(lesson.id, id)).returning();
      return { row: saved!, changed: true };
    }

    let debrief: Record<string, unknown> | undefined;
    if (judged) {
      const before = "questions" in judged ? await skillProfile(tx, userId) : undefined;
      await recordScores(tx, userId, scores, { alpha: settings.alphaLesson, source: "lesson", sourceId: id, at });
      if ("questions" in judged) {
        const after = await skillProfile(tx, userId);
        const skillChanges = Object.fromEntries(
          skills.filter((s) => s in scores).map((s) => [s, { from: before![s]?.score ?? null, to: after[s]!.score }]),
        );
        const { overallImpression, questions, phrasesToLearn } = judged;
        debrief = { textMode: row.textMode, overallImpression, questions, phrasesToLearn, skillChanges };
        await tx.insert(step).values(
          questions.map((q, position) => ({
            userId,
            lessonId: id,
            position,
            type: "roleplayTurn" as const,
            mode: row.textMode ? ("text" as const) : ("voice" as const),
            input: { question: q.question },
            output: { answer: q.quote },
            feedback: {
              verdict: q.languageIssues.length ? ("almost" as const) : ("correct" as const),
              corrected: q.strongerPhrasing,
              explanation: q.languageIssues.join("; "),
            },
            answeredAt: at,
          })),
        );
        await addFocusItems(
          tx,
          userId,
          phrasesToLearn.map((label) => ({
            userId,
            label,
            kind: "phrase" as const,
            source: "debrief" as const,
            sourceId: id,
            createdAt: at,
          })),
        );
      } else if (judged.focusItems?.length) {
        await addFocusItems(
          tx,
          userId,
          judged.focusItems.map((f) => ({
            userId,
            ...f,
            source: "lesson" as const,
            sourceId: id,
            createdAt: at,
          })),
        );
      }
    }
    if (judged && "feedback" in judged) {
      const savedSteps = await tx.select().from(step).where(eq(step.lessonId, id));
      for (const f of judged.feedback) {
        const target = savedSteps.find((s) => s.position === f.position)!;
        const { position, ...feedback } = f;
        await tx
          .update(step)
          .set({ feedback: target.feedback ?? feedback })
          .where(eq(step.id, target.id));
      }
    }
    if (judged) await remember(tx, userId, `${row.title}: ${judged.summary}`, at);
    const [saved] = await tx
      .update(lesson)
      .set({
        report: judged && !("questions" in judged) ? judged : undefined,
        status: "completed",
        completedAt: at,
        objectiveProgress: judged?.objectiveProgress,
        summary: judged?.summary,
        debrief,
      })
      .where(eq(lesson.id, id))
      .returning();
    if (row.unitId) await advanceUnit(tx, row.unitId);
    return { row: saved!, changed: true };
  });
  return { status: result.row.status, ...(result.row.debrief && { debrief: result.row.debrief }) };
}
