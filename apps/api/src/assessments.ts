import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { NoObjectGeneratedError, Output, safeValidateUIMessages, type UIMessage } from "ai";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate, streamChat } from "./ai";
import type { AppEnv, Deps } from "./app";
import { cefrLevel, goalKind, targetLevels } from "./goals";
import { reportEmail } from "./mailer";
import type { RealtimeBroker } from "./realtime";
import { buildRoadmap, reviseRoadmap } from "./roadmap";
import { fluencyScore, recordScores, scoreView, type SpeechSegment } from "./scoring";
import { answeredSteps, stepTools, takeAnswer } from "./steps";

const { assessment, goal, focusItem } = schema;

const MIN_MINUTES = 4;
const RETAKE_DAYS = 7;

const skillResult = z.object({ score: z.number().min(0).max(100), evidence: z.array(z.string()) });

// What the report model must return.
export const reportOutput = z.object({
  overallLevel: cefrLevel,
  skills: z.object({ grammar: skillResult, vocabulary: skillResult, fluency: skillResult.optional() }),
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
  proposedGoals: z.array(z.object({ kind: goalKind, targetLevels })),
  firstUnit: z.object({ title: z.string(), objective: z.string() }),
});

const phases = `Run the Assessment in five phases within 10 minutes:
1. Warm-up: easy small talk.
2. You and your work: {goals}
3. Goal scenario: a realistic situation from their Goal.
4. Stretch question: something abstract or complex, to find their ceiling.
5. Wrap-up: thank them and close.
Make questions easier or harder depending on how they answer. Ask one question at a time. Don't correct them; just listen.`;

// Structured items reuse the Lesson Step tools. The model is asked for 3–4; the server stops offering them after 4.
const itemTools = { fillGap: stepTools.fillGap, rewrite: stepTools.rewrite };
const MAX_ITEMS = 4;

// `items` is the count of structured items answered so far; a Voice Assessment has none.
const instructions = (briefs: string[], minutes: number, items?: number) =>
  `You are Impromptu, an English coach, running an Assessment of the Learner's English.
${phases.replace(
  "{goals}",
  briefs.length
    ? `go deeper into their situation. What you know about them:\n${briefs.join("\n\n")}`
    : "ask what they're preparing for (a job interview, client work or general fluency).",
)}
${
  items === undefined
    ? ""
    : `During phases 2–4, also give 3–4 structured items, one at a time, using the fillGap and rewrite tools, pitched at the
level they're showing. Don't tell them whether they got an item right. ${items} answered so far.\n`
}${minutes.toFixed(0)} of 10 minutes have passed.`;

const reportInstructions = (mode: Row["mode"]) => `You are an examiner for English as a second language. Read the Assessment transcript
and assess the Learner (the "Learner" lines only) against the official CEFR descriptors for grammar and vocabulary${
  mode === "voice" ? ", and score fluency on how coherent and connected their speech is (speed and pauses are measured separately)" : ""
}.
Score each skill 0–100 with quotes as evidence. Give exactly 3 strengths and 3–5 weaknesses; each weakness quotes
what the Learner said and gives a better version. Propose Goals and Target Levels, and preview the first Unit.`;

// The transcript as the report model reads it, structured items and the Learner's answers (with grades) included.
const textOf = (messages: UIMessage[]) =>
  messages
    .flatMap((m) =>
      m.parts.flatMap((p: any) => {
        if (p.type === "text") return [`${m.role === "user" ? "Learner" : "Coach"}: ${p.text}`];
        if (p.state !== "output-available" || !(p.type.replace(/^tool-/, "") in itemTools)) return [];
        const graded = p.output.grade ? ` (${p.output.grade.correct ? "correct" : `incorrect, expected "${p.output.grade.expected}"`})` : "";
        return [`Item (${p.type.replace(/^tool-/, "")}): ${JSON.stringify(p.input)}\nLearner's answer: "${p.output.answer}"${graded}`];
      }),
    )
    .join("\n");

type Row = typeof assessment.$inferSelect;

// The Learner's spoken stretches, from the voice timing kept on a Voice Assessment's transcript.
const speechSegments = (transcript: UIMessage[]): SpeechSegment[] =>
  transcript.flatMap((m) => {
    const t = m.metadata as { speechStartMs?: number; speechEndMs?: number } | undefined;
    if (m.role !== "user" || t?.speechStartMs === undefined || t.speechEndMs === undefined) return [];
    const words = m.parts.flatMap((p) => (p.type === "text" ? p.text.split(/\s+/).filter(Boolean) : [])).length;
    return [{ words, startMs: t.speechStartMs, endMs: t.speechEndMs }];
  });

export const assessments = ({
  db,
  now,
  models,
  mailer,
  env,
  settings,
  broker,
}: Deps & { settings: { alphaAssessment: number }; broker: RealtimeBroker }) => {
  const find = async (id: string, userId: string) =>
    (await db.select().from(assessment).where(and(eq(assessment.id, id), eq(assessment.userId, userId))))[0];

  const briefsOf = async (userId: string) =>
    (
      await db
        .select({ brief: goal.brief })
        .from(goal)
        .where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")))
    ).flatMap((g) => (g.brief ? [g.brief] : []));

  // Sends the Learner's first-ever completed Report, once. emailed_at is claimed before sending,
  // and released if sending fails so a later Report can try again.
  async function emailIfFirst(row: Row, to: string, report: z.infer<typeof reportOutput>) {
    const [claimed] = await db
      .update(assessment)
      .set({ emailedAt: now() })
      .where(
        and(
          eq(assessment.id, row.id),
          sql`not exists (select 1 from ${assessment} where ${assessment.userId} = ${row.userId} and ${assessment.emailedAt} is not null)`,
        ),
      )
      .returning({ id: assessment.id });
    if (!claimed) return;
    try {
      await mailer.send(reportEmail(to, report, env.WEB_ORIGIN));
    } catch (e) {
      console.error("first-Report email failed", e);
      await db.update(assessment).set({ emailedAt: null }).where(eq(assessment.id, row.id));
    }
  }

  // Ends an attempt. Under 4 minutes it's discarded; otherwise the Report is written, partial if the Learner left early.
  async function finish(row: Row, user: { id: string; email: string }, { partial }: { partial: boolean }) {
    if (row.mode === "voice") {
      // Hang up first, so the transcript holds everything that was said.
      await broker.hangup(user.id);
      row = (await find(row.id, user.id))!;
    }
    const at = now();
    if (at.getTime() - row.startedAt.getTime() < MIN_MINUTES * 60_000) {
      await db.update(assessment).set({ status: "discarded", endedAt: at }).where(eq(assessment.id, row.id));
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
    const report = {
      ...out,
      partial,
      skills: {
        fluency: fluency === null ? null : { ...scoreView(fluency), evidence: spoken!.evidence },
        grammar: { ...scoreView(grammar.score), evidence: grammar.evidence },
        vocabulary: { ...scoreView(vocabulary.score), evidence: vocabulary.evidence },
      },
    };
    const userId = user.id;

    await db.transaction(async (tx) => {
      await tx.update(assessment).set({ status: "completed", endedAt: at, report }).where(eq(assessment.id, row.id));
      await recordScores(
        tx,
        userId,
        { grammar: grammar.score, vocabulary: vocabulary.score, ...(fluency !== null && { fluency }) },
        { alpha: settings.alphaAssessment, source: "assessment", sourceId: row.id, at },
      );
      await tx.insert(focusItem).values(
        out.weaknesses.map((w) => ({ userId, label: w.label, kind: w.kind, source: "assessment" as const, sourceId: row.id, createdAt: at })),
      );
      const hasGoals = (await tx.select({ id: goal.id }).from(goal).where(eq(goal.userId, userId)).limit(1)).length > 0;
      if (!hasGoals && out.proposedGoals.length)
        await tx.insert(goal).values(out.proposedGoals.map((g) => ({ userId, kind: g.kind, targetLevels: g.targetLevels, createdAt: at })));
    });
    await emailIfFirst(row, user.email, out);
    // Goals confirmed before the Assessment were waiting for a Skill Profile (if this fails, POST /api/roadmap retries);
    // a retake revises the Roadmap the Learner already has.
    if ((await buildRoadmap({ db, now, models }, userId)) === "exists") await reviseRoadmap({ db, now, models }, userId);

    return { status: "completed" as const, report };
  }

  return new Hono<AppEnv>()
    .get("/", async (c) =>
      c.json(await db.select().from(assessment).where(eq(assessment.userId, c.var.user.id)).orderBy(asc(assessment.startedAt))),
    )
    .post("/", zValidator("json", z.object({ mode: z.enum(["written", "voice"]) })), async (c) => {
      const user = c.var.user;

      // An attempt left open (closed tab, lost connection) is wrapped up as if the Learner left.
      const open = await db
        .select()
        .from(assessment)
        .where(and(eq(assessment.userId, user.id), eq(assessment.status, "in_progress")));
      for (const row of open) {
        if ((await finish(row, user, { partial: true })).status === "failed")
          return c.json({ error: "Your previous Assessment couldn't be finished. Try again." }, 502);
      }

      const [last] = await db
        .select({ endedAt: assessment.endedAt })
        .from(assessment)
        .where(and(eq(assessment.userId, user.id), eq(assessment.status, "completed")))
        .orderBy(desc(assessment.endedAt))
        .limit(1);
      const nextAllowedAt = last?.endedAt && new Date(last.endedAt.getTime() + RETAKE_DAYS * 86_400_000);
      if (nextAllowedAt && now() < nextAllowedAt)
        return c.json({ error: "You can retake the Assessment once a week.", nextAllowedAt }, 429);

      const [row] = await db
        .insert(assessment)
        .values({ userId: user.id, mode: c.req.valid("json").mode, startedAt: now() })
        .returning();
      return c.json(row!, 201);
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
      if (row.mode !== "written") return c.json({ error: "A Voice Assessment runs over its call, not the chat" }, 409);

      const taken = takeAnswer(row.transcript as UIMessage[], c.req.valid("json").message);
      if ("error" in taken) return c.json({ error: taken.error, issues: taken.issues }, taken.status);
      const valid = await safeValidateUIMessages({ messages: taken.messages, tools: itemTools });
      if (!valid.success) return c.json({ error: valid.error.message }, 400);
      const items = answeredSteps(valid.data).length;

      const minutes = (now().getTime() - row.startedAt.getTime()) / 60_000;

      return streamChat({ db, now }, userId, {
        model: models.step,
        instructions: instructions(await briefsOf(userId), minutes, items),
        messages: valid.data,
        tools: itemTools,
        activeTools: items < MAX_ITEMS ? ["fillGap", "rewrite"] : [],
        save: (transcript) => db.update(assessment).set({ transcript }).where(eq(assessment.id, row.id)),
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

      const call = await broker.start(userId, {
        sdp: offer,
        instructions: instructions(await briefsOf(userId), 0),
        purpose: "assessment",
        onTranscript: (transcript) => db.update(assessment).set({ transcript }).where(eq(assessment.id, row.id)),
      });
      if ("busy" in call) return c.json({ error: "You already have a live voice call" }, 409);
      return c.body(call.answer, 201, { "content-type": "application/sdp" });
    })
    .post("/:id/end", zValidator("json", z.object({ left: z.boolean().optional() })), async (c) => {
      const row = await find(c.req.param("id"), c.var.user.id);
      if (!row) return c.json({ error: "Assessment not found" }, 404);
      if (row.status !== "in_progress") return c.json({ error: "This Assessment has ended" }, 409);

      const result = await finish(row, c.var.user, { partial: c.req.valid("json").left ?? false });
      if (result.status === "failed") return c.json({ error: "The Report couldn't be generated. Try again." }, 502);
      return c.json(result);
    });
};
