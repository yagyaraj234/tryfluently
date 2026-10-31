import { schema } from "@fluently/db";
import { zValidator } from "@hono/zod-validator";
import { NoObjectGeneratedError, Output, safeValidateUIMessages, type UIMessage } from "ai";
import { and, asc, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate, streamChat, unchanged } from "./ai";
import type { AppEnv, Deps } from "./app";
import { goalText } from "./goal-text";
import { cefrLevel } from "./goals";
import { enqueueAssessmentJobs, practicePreparation, retryPracticePreparation } from "./assessment-jobs";
import { answerCall, endCallTool, voiceLimitMessage, type RealtimeBroker } from "./realtime";
import { remember, addFocusItems } from "./learning-memory";
import { cefr, fluencyScore, recordScores, scoreView, speechSegments } from "./scoring";
import { answeredSteps, stepTools, takeAnswer } from "./steps";

const { assessment, goal } = schema;

const MIN_MINUTES = 4;
const MAX_SECONDS = 10 * 60;
// A Written Assessment has no clock; it ends once the Learner has answered this many questions.
const MAX_ANSWERS = 12;
const RETAKE_DAYS = 7;

const skillResult = z.object({ score: z.number().min(0).max(100), evidence: z.array(z.string()) });
const proposedTargetLevels = z.object({ fluency: cefrLevel, grammar: cefrLevel, vocabulary: cefrLevel });

// What the report model must return.
export const reportOutput = z.object({
  overallLevel: cefrLevel,
  // OpenAI strict JSON Schema requires every object key; null means fluency was not observed.
  skills: z.object({ grammar: skillResult, vocabulary: skillResult, fluency: skillResult.nullable() }),
  strengths: z.array(z.string()).length(3),
  weaknesses: z
    .array(
      z.object({
        label: z.string(),
        kind: z.enum(["grammar", "vocabulary", "phrase"]),
        quote: z.string(),
        betterVersion: z.string(),
      }),
    )
    .min(3)
    .max(5),
  proposedGoals: z.array(z.object({ statement: z.string().min(3).max(300), targetLevels: proposedTargetLevels })),
  firstUnit: z.object({ title: z.string(), objective: z.string() }),
});

const phases = `Run the Assessment in five phases:
1. Warm-up: easy small talk.
2. You and your work: {goals}
3. Goal scenario: a realistic situation from their Goal.
4. Stretch question: something abstract or complex, to find their ceiling.
5. Wrap-up: thank them and close.
Make questions easier or harder depending on how they answer. Ask one question at a time. Don't correct them; just listen.`;

// Structured items reuse the Lesson Step tools. The model is asked for 3–4; the server stops offering them after 4.
const itemTools = { fillGap: stepTools.fillGap, rewrite: stepTools.rewrite };
const MAX_ITEMS = 4;

// Questions the Learner has answered in a Written Assessment: replies (not the opening message) plus answered items.
const answersOf = (messages: UIMessage[]) =>
  Math.max(0, messages.filter((m) => m.role === "user").length - 1) + answeredSteps(messages).length;

// A Written Assessment passes `written`; a Voice Assessment has no items and is timed instead.
const instructions = (goalTexts: string[], written?: { items: number; answers: number }) =>
  `You are Fluently, an English coach, running an Assessment of the Learner's English.
Write plain text only: no markdown, no asterisks or bold.
${phases.replace(
  "{goals}",
  goalTexts.length
    ? `go deeper into their situation. What you know about them:\n${goalTexts.join("\n\n")}`
    : "ask what they want to achieve with English.",
)}
${
  written
    ? `During phases 2–4, also give 3–4 structured items, one at a time, using the fillGap and rewrite tools, pitched at the
level they're showing. Don't tell them whether they got an item right. ${written.items} items answered so far.
Aim to finish in about ${MAX_ANSWERS} questions; ${written.answers} answered so far.${
        written.answers >= MAX_ANSWERS
          ? " That's enough: thank them and close now, with no further questions."
          : " Don't thank them or close the conversation yet, even if you have covered every phase: keep asking new questions."
      }\n`
    : `Finish within 10 minutes. When you've closed the conversation, say a short closing sentence such as "I'm ending the call now." Then call end_call. Do not call it before you have spoken the closing sentence.\n`
}`;

const reportInstructions = (
  mode: Row["mode"],
) => `You are an examiner for English as a second language. Read the Assessment transcript
and assess the Learner (the "Learner" lines only) against the official CEFR descriptors for grammar and vocabulary${
  mode === "voice"
    ? ", and score fluency on how coherent and connected their speech is (speed and pauses are measured separately)"
    : ""
}.
Score each measured skill 0–100 with quotes as evidence; set fluency to null for a Written Assessment. Give exactly 3 strengths and 3–5 weaknesses; each weakness quotes
what the Learner said and gives a better version. Propose one Goal in the Learner's own words with Target Levels, and preview the first Unit.`;

// The transcript as the report model reads it, structured items and the Learner's answers (with grades) included.
const textOf = (messages: UIMessage[]) =>
  messages
    .flatMap((m) =>
      m.parts.flatMap((p: any) => {
        if (p.type === "text") return [`${m.role === "user" ? "Learner" : "Coach"}: ${p.text}`];
        if (p.state !== "output-available" || !(p.type.replace(/^tool-/, "") in itemTools)) return [];
        const graded = p.output.grade
          ? ` (${p.output.grade.correct ? "correct" : `incorrect, expected "${p.output.grade.expected}"`})`
          : "";
        return [
          `Item (${p.type.replace(/^tool-/, "")}): ${JSON.stringify(p.input)}\nLearner's answer: "${p.output.answer}"${graded}`,
        ];
      }),
    )
    .join("\n");

type Row = typeof assessment.$inferSelect;

export const assessments = ({
  db,
  now,
  models,
  settings,
  broker,
}: Deps & { settings: { alphaAssessment: number }; broker: RealtimeBroker }) => {
  const find = async (id: string, userId: string) =>
    (
      await db
        .select()
        .from(assessment)
        .where(and(eq(assessment.id, id), eq(assessment.userId, userId)))
    )[0];

  const goalTextsOf = async (userId: string) =>
    (
      await db
        .select({ statement: goal.statement, brief: goal.brief })
        .from(goal)
        .where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")))
    ).flatMap((g) => {
      const text = goalText(g);
      return text ? [text] : [];
    });

  const secondsLeft = (row: Row) => MAX_SECONDS - (now().getTime() - row.startedAt.getTime()) / 1000;

  // Ends an attempt. Under 4 minutes it's discarded; otherwise the Report is written, partial if the Learner left early.
  async function finish(row: Row, user: { id: string; email: string }, { partial }: { partial: boolean }) {
    if (row.mode === "voice") {
      // Hang up first, so the transcript holds everything that was said.
      await broker.hangup(user.id, row.id);
      row = (await find(row.id, user.id))!;
    }
    const at = now();
    // A Written Assessment that got through every question counts however quickly it was done.
    const complete = row.mode === "written" && answersOf(row.transcript as UIMessage[]) >= MAX_ANSWERS;
    if (!complete && at.getTime() - row.startedAt.getTime() < MIN_MINUTES * 60_000) {
      await db
        .update(assessment)
        .set({ status: "discarded", endedAt: at })
        .where(and(eq(assessment.id, row.id), eq(assessment.status, "in_progress")));
      return { status: "discarded" as const };
    }

    let out: z.infer<typeof reportOutput>;
    try {
      ({ output: out } = await generate({ db, now }, user.id, {
        model: models.report,
        instructions: reportInstructions(row.mode),
        prompt: textOf(row.transcript as UIMessage[]),
        output: Output.object({ schema: reportOutput }),
      }));
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) return { status: "failed" as const };
      throw e;
    }

    // Only a Voice Assessment measures fluency; a Written one ignores whatever the model says about it.
    const { grammar, vocabulary } = out.skills;
    const spoken = row.mode === "voice" ? out.skills.fluency : undefined;
    const fluency = spoken ? fluencyScore(speechSegments(row.transcript as UIMessage[]), spoken.score) : null;
    // The overall level follows the skill scores the Learner sees, so the two can't disagree (the model's own guess did).
    const measured = [grammar.score, vocabulary.score, ...(fluency === null ? [] : [fluency])];
    const report = {
      ...out,
      overallLevel: cefr(measured.reduce((a, b) => a + b, 0) / measured.length),
      partial,
      skills: {
        fluency: fluency === null ? null : { ...scoreView(fluency), evidence: spoken!.evidence },
        grammar: { ...scoreView(grammar.score), evidence: grammar.evidence },
        vocabulary: { ...scoreView(vocabulary.score), evidence: vocabulary.evidence },
      },
    };
    const userId = user.id;

    const changed = await db.transaction(async (tx) => {
      await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
      // Concurrent /end requests may both finish judging; only one commits learning results.
      const [locked] = await tx.select().from(assessment).where(eq(assessment.id, row.id)).for("update");
      if (locked?.status !== "in_progress") return false;
      await tx.update(assessment).set({ status: "completed", endedAt: at, report }).where(eq(assessment.id, row.id));
      await recordScores(
        tx,
        userId,
        { grammar: grammar.score, vocabulary: vocabulary.score, ...(fluency !== null && { fluency }) },
        { alpha: settings.alphaAssessment, source: "assessment", sourceId: row.id, at },
      );
      await addFocusItems(
        tx,
        userId,
        out.weaknesses.map((w) => ({
          userId,
          label: w.label,
          kind: w.kind,
          source: "assessment" as const,
          sourceId: row.id,
          createdAt: at,
        })),
      );
      const hasGoals = (await tx.select({ id: goal.id }).from(goal).where(eq(goal.userId, userId)).limit(1)).length > 0;
      if (!hasGoals && out.proposedGoals.length)
        await tx.insert(goal).values(
          out.proposedGoals.map((g) => ({
            userId,
            kind: "general_fluency" as const,
            statement: g.statement,
            targetLevels: g.targetLevels,
            createdAt: at,
          })),
        );
      await remember(
        tx,
        userId,
        `Assessment strengths: ${out.strengths.join("; ")}. Difficulties: ${out.weaknesses.map((w) => w.label).join("; ")}`,
        at,
      );
      await enqueueAssessmentJobs(tx, row.id, userId, at);
      return true;
    });
    if (!changed) {
      const saved = await find(row.id, userId);
      if (saved?.status === "completed") return { status: "completed" as const, report: saved.report as typeof report };
      return { status: "ended" as const };
    }
    return { status: "completed" as const, report };
  }

  return (
    new Hono<AppEnv>()
      .get("/preparation", async (c) => c.json(await practicePreparation(db, c.var.user.id, now())))
      .post("/preparation", async (c) => {
        if (!(await retryPracticePreparation(db, c.var.user.id, now())))
          return c.json({ error: "Confirm your Goals and complete an Assessment first" }, 409);
        return c.json({ status: "pending" as const }, 202);
      })
      .get("/", async (c) =>
        c.json(
          await db
            .select()
            .from(assessment)
            .where(eq(assessment.userId, c.var.user.id))
            .orderBy(asc(assessment.startedAt)),
        ),
      )
      .post("/", zValidator("json", z.object({ mode: z.enum(["written", "voice"]) })), async (c) => {
        const user = c.var.user;

        // An attempt left open (closed tab, lost connection) is wrapped up as if the Learner left.
        const open = await db
          .select()
          .from(assessment)
          .where(and(eq(assessment.userId, user.id), eq(assessment.status, "in_progress")));
        for (const row of open) {
          // A start created during this request belongs to the same overlapping attempt.
          if (row.startedAt >= c.var.requestStartedAt) return c.json(row, 200);
          if (!c.var.claimConversation(row.id))
            return c.json({ error: "A turn is still in progress. Try again when it finishes." }, 409);
          const current = await find(row.id, user.id);
          if (!current || current.status !== "in_progress") continue;
          if ((await finish(current, user, { partial: true })).status === "failed")
            return c.json({ error: "Your previous Assessment couldn't be finished. Try again." }, 502);
        }

        // Under the Learner lock so concurrent starts can't each pass the checks.
        const started = await db.transaction(async (tx) => {
          await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, user.id)).for("update");
          const [stillOpen] = await tx
            .select({ id: assessment.id })
            .from(assessment)
            .where(and(eq(assessment.userId, user.id), eq(assessment.status, "in_progress")));
          if (stillOpen) return { open: true as const };
          const [last] = await tx
            .select({ endedAt: assessment.endedAt })
            .from(assessment)
            .where(and(eq(assessment.userId, user.id), eq(assessment.status, "completed")))
            .orderBy(desc(assessment.endedAt))
            .limit(1);
          const nextAllowedAt = last?.endedAt && new Date(last.endedAt.getTime() + RETAKE_DAYS * 86_400_000);
          if (nextAllowedAt && now() < nextAllowedAt) return { nextAllowedAt };
          const [row] = await tx
            .insert(assessment)
            .values({ userId: user.id, mode: c.req.valid("json").mode, startedAt: now() })
            .returning();
          return { row: row! };
        });
        if ("open" in started) return c.json({ error: "An Assessment is already in progress." }, 409);
        if ("nextAllowedAt" in started)
          return c.json(
            { error: "You can retake the Assessment once a week.", nextAllowedAt: started.nextAllowedAt },
            429,
          );
        return c.json(started.row, 201);
      })
      .get("/:id", async (c) => {
        const row = await find(c.req.param("id"), c.var.user.id);
        return row ? c.json(row) : c.json({ error: "Assessment not found" }, 404);
      })
      .post("/:id/chat", zValidator("json", z.object({ message: z.unknown() })), async (c) => {
        const userId = c.var.user.id;
        const row = await find(c.req.param("id"), userId);
        if (!row) return c.json({ error: "Assessment not found" }, 404);
        if (row.status !== "in_progress") return c.json({ error: "This Assessment has ended" }, 409);
        if (row.mode !== "written")
          return c.json({ error: "A Voice Assessment runs over its call, not the chat" }, 409);

        const taken = takeAnswer(row.transcript as UIMessage[], c.req.valid("json").message);
        if ("error" in taken) return c.json({ error: taken.error, issues: taken.issues }, taken.status);
        const valid = await safeValidateUIMessages({ messages: taken.messages, tools: itemTools });
        if (!valid.success) return c.json({ error: valid.error.message }, 400);
        const items = answeredSteps(valid.data).length;
        const answers = answersOf(valid.data);

        return streamChat({ db, now }, userId, {
          model: models.step,
          instructions: instructions(await goalTextsOf(userId), { items, answers }),
          messages: valid.data,
          tools: itemTools,
          activeTools: items < MAX_ITEMS && answers < MAX_ANSWERS ? ["fillGap", "rewrite"] : [],
          save: (transcript) =>
            db
              .update(assessment)
              .set({ transcript })
              .where(
                and(
                  eq(assessment.id, row.id),
                  eq(assessment.status, "in_progress"),
                  unchanged(assessment.transcript, (row.transcript as unknown[]).length),
                ),
              )
              .returning({ id: assessment.id }),
        });
      })
      // The browser posts its SDP offer and gets back only the SDP answer; the OpenAI key never leaves the server.
      .post("/:id/call", async (c) => {
        const userId = c.var.user.id;
        const offer = await c.req.text();
        if (!offer || offer.length > 20_000) return c.json({ error: "Send the SDP offer as the request body" }, 400);
        const row = await find(c.req.param("id"), userId);
        if (!row) return c.json({ error: "Assessment not found" }, 404);
        if (row.mode !== "voice" || row.status !== "in_progress")
          return c.json({ error: "Calls are only for a Voice Assessment in progress" }, 409);

        const budgetSeconds = secondsLeft(row);
        if (budgetSeconds <= 0) return c.json({ error: "This Assessment is out of time" }, 409);

        const call = await broker.start(userId, {
          targetId: row.id,
          budgetSeconds,
          sdp: offer,
          instructions: instructions(await goalTextsOf(userId)),
          purpose: "assessment",
          tools: [endCallTool],
          endTool: endCallTool.name,
          prior: row.transcript,
          onTranscript: (transcript) =>
            db
              .update(assessment)
              .set({ transcript })
              .where(and(eq(assessment.id, row.id), eq(assessment.status, "in_progress"))),
        });
        if ("capped" in call) return c.json({ error: voiceLimitMessage, ...call.capped }, 429);
        if ("unavailable" in call) return c.json({ error: "Server is shutting down. Try again shortly." }, 503);
        if ("busy" in call) return c.json({ error: "You already have a live voice call" }, 409);
        return answerCall(c, call);
      })
      .post("/:id/end", zValidator("json", z.object({ left: z.boolean().optional() })), async (c) => {
        const row = await find(c.req.param("id"), c.var.user.id);
        if (!row) return c.json({ error: "Assessment not found" }, 404);
        if (row.status === "completed")
          return c.json({
            status: "completed" as const,
            report: row.report as Extract<Awaited<ReturnType<typeof finish>>, { status: "completed" }>["report"],
          });
        if (row.status !== "in_progress") return c.json({ error: "This Assessment has ended" }, 409);

        const result = await finish(row, c.var.user, { partial: c.req.valid("json").left ?? false });
        if (result.status === "failed") return c.json({ error: "The Report couldn't be generated. Try again." }, 502);
        if (result.status === "ended") return c.json({ error: "This Assessment has ended" }, 409);
        return c.json(result);
      })
  );
};
