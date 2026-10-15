import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { NoObjectGeneratedError, Output, safeValidateUIMessages, type UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate, streamChat } from "./ai";
import type { AppEnv, Deps } from "./app";
import { cefrLevel, goalKind, targetLevels } from "./goals";
import { recordScores, scoreView } from "./scoring";

const { assessment, goal, focusItem } = schema;

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

const instructions = (briefs: string[], minutes: number) =>
  `You are Impromptu, an English coach, running an Assessment of the Learner's English.
${phases.replace(
  "{goals}",
  briefs.length
    ? `go deeper into their situation. What you know about them:\n${briefs.join("\n\n")}`
    : "ask what they're preparing for (a job interview, client work or general fluency).",
)}
${minutes.toFixed(0)} of 10 minutes have passed.`;

const reportInstructions = `You are an examiner for English as a second language. Read the Assessment transcript
and assess the Learner (the "Learner" lines only) against the official CEFR descriptors for grammar and vocabulary.
Score each skill 0–100 with quotes as evidence. Give exactly 3 strengths and 3–5 weaknesses; each weakness quotes
what the Learner said and gives a better version. Propose Goals and Target Levels, and preview the first Unit.`;

const textOf = (messages: UIMessage[]) =>
  messages
    .map((m) => `${m.role === "user" ? "Learner" : "Coach"}: ${m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ")}`)
    .join("\n");

export const assessments = ({ db, now, models, settings }: Deps & { settings: { alphaAssessment: number } }) => {
  const find = async (id: string, userId: string) =>
    (await db.select().from(assessment).where(and(eq(assessment.id, id), eq(assessment.userId, userId))))[0];

  return new Hono<AppEnv>()
    .post("/", zValidator("json", z.object({ mode: z.literal("written") })), async (c) => {
      const [row] = await db
        .insert(assessment)
        .values({ userId: c.var.user.id, mode: c.req.valid("json").mode, startedAt: now() })
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

      const valid = await safeValidateUIMessages({ messages: [...row.transcript, c.req.valid("json").message] });
      if (!valid.success) return c.json({ error: valid.error.message }, 400);

      const briefs = await db
        .select({ brief: goal.brief })
        .from(goal)
        .where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")));
      const minutes = (now().getTime() - row.startedAt.getTime()) / 60_000;

      return streamChat({ db, now }, userId, {
        model: models.step,
        instructions: instructions(briefs.flatMap((g) => (g.brief ? [g.brief] : [])), minutes),
        messages: valid.data,
        save: (transcript) => db.update(assessment).set({ transcript }).where(eq(assessment.id, row.id)),
      });
    })
    .post("/:id/end", async (c) => {
      const userId = c.var.user.id;
      const row = await find(c.req.param("id"), userId);
      if (!row) return c.json({ error: "Assessment not found" }, 404);
      if (row.status !== "in_progress") return c.json({ error: "This Assessment has ended" }, 409);

      let out: z.infer<typeof reportOutput>;
      try {
        ({ output: out } = await generate({ db, now }, userId, {
          model: models.report,
          instructions: reportInstructions,
          prompt: textOf(row.transcript as UIMessage[]),
          output: Output.object({ schema: reportOutput }),
        }));
      } catch (e) {
        if (NoObjectGeneratedError.isInstance(e)) return c.json({ error: "The Report couldn't be generated. Try again." }, 502);
        throw e;
      }

      // A Written Assessment doesn't measure fluency, whatever the model says.
      const { grammar, vocabulary } = out.skills;
      const report = {
        ...out,
        skills: {
          fluency: null,
          grammar: { ...scoreView(grammar.score), evidence: grammar.evidence },
          vocabulary: { ...scoreView(vocabulary.score), evidence: vocabulary.evidence },
        },
      };
      const at = now();

      await db.transaction(async (tx) => {
        await tx.update(assessment).set({ status: "completed", endedAt: at, report }).where(eq(assessment.id, row.id));
        await recordScores(
          tx,
          userId,
          { grammar: grammar.score, vocabulary: vocabulary.score },
          { alpha: settings.alphaAssessment, source: "assessment", sourceId: row.id, at },
        );
        await tx.insert(focusItem).values(
          out.weaknesses.map((w) => ({ userId, label: w.label, kind: w.kind, source: "assessment" as const, sourceId: row.id, createdAt: at })),
        );
        const hasGoals = (await tx.select({ id: goal.id }).from(goal).where(eq(goal.userId, userId)).limit(1)).length > 0;
        if (!hasGoals && out.proposedGoals.length)
          await tx.insert(goal).values(out.proposedGoals.map((g) => ({ userId, kind: g.kind, targetLevels: g.targetLevels, createdAt: at })));
      });

      return c.json(report);
    });
};
