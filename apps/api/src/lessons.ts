import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { NoObjectGeneratedError, Output, safeValidateUIMessages, tool, type ToolUIPart, type UIMessage } from "ai";
import { and, asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate, streamChat } from "./ai";
import type { AppEnv, Deps } from "./app";
import { progressUnit } from "./roadmap";
import { recordScores, skillProfile } from "./scoring";

const { lesson, step, unit, goal, focusItem } = schema;

const MIN_STEPS = 3;
const MAX_STEPS = 10;

const textAnswer = z.object({ answer: z.string().trim().min(1).max(2000) });

// Step tools have no `execute`: the client renders them and returns the Learner's answer as the tool output.
export const stepTools = {
  fillGap: tool({
    description: "A sentence with one gap (___) for the Learner to fill. Graded on the server by exact match.",
    inputSchema: z.object({ sentence: z.string(), answer: z.string(), choices: z.array(z.string()).optional() }),
    outputSchema: textAnswer,
  }),
  vocabCard: tool({
    description: "Teach a word: show it with its meaning and an example, then the Learner writes their own sentence using it.",
    inputSchema: z.object({ word: z.string(), meaning: z.string(), example: z.string() }),
    outputSchema: textAnswer,
  }),
  rewrite: tool({
    description: "A flawed or plain sentence and what to aim for; the Learner writes an improved version.",
    inputSchema: z.object({ sentence: z.string(), aim: z.string() }),
    outputSchema: textAnswer,
  }),
};
type StepType = keyof typeof stepTools;
const stepTypes = Object.keys(stepTools) as StepType[];

const feedbackInput = z.object({
  verdict: z.enum(["correct", "almost", "incorrect"]),
  corrected: z.string(),
  explanation: z.string(),
});

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Steps the server can check itself; the rest are judged by the model through giveFeedback.
function grade(type: StepType, input: any, output: z.infer<typeof textAnswer>) {
  if (type === "fillGap") return { correct: normalise(output.answer) === normalise(input.answer), expected: input.answer as string };
  return null;
}

const planOutput = z.object({ title: z.string(), objective: z.string() });

const planInstructions = `You plan the next short Lesson (3–10 Steps) in a Unit of an English coaching Roadmap.
Give it a title and one concrete objective. Build on the earlier Lessons' summaries without repeating them,
and work in the Learner's open Focus Items where they fit the Unit.`;

const chatInstructions = (l: { objective: string }, briefs: string[], focus: string[], answered: number) =>
  `You are Impromptu, an English coach, running a short Lesson made of Steps.
Lesson objective: ${l.objective}
${briefs.length ? `What you know about the Learner:\n${briefs.join("\n\n")}` : ""}
${focus.length ? `Their open Focus Items, to weave in where natural: ${focus.join("; ")}` : ""}
Steps answered so far: ${answered}.
Each turn: if the Learner just answered a Step, first call giveFeedback with a verdict, the corrected version and a
one-sentence explanation. Then call exactly one Step tool for the next Step, adapting to how they did.
fillGap answers are already graded on the server: use its verdict. Keep any text short.
Once the objective has been practised enough, call endLesson.`;

const skillResult = z.object({ score: z.number().min(0).max(100), evidence: z.array(z.string()) });

// What the judge returns after each Lesson: only the skills it saw evidence for are scored.
const judgeOutput = z.object({
  skills: z.object({ fluency: skillResult, grammar: skillResult, vocabulary: skillResult }).partial(),
  objectiveProgress: z.number().int().min(0).max(100),
  summary: z.string(),
});

const judgeInstructions = `You are an examiner for English as a second language. Judge one finished Lesson from its Steps:
what the Learner was asked, what they answered and the feedback they got. Using the official CEFR descriptors, score
0–100 only the skills (fluency, grammar, vocabulary) the Learner showed evidence of, with quotes. Rate progress on the
Lesson objective 0–100, and write a two-sentence summary that the next Lesson can build on.`;

const isPendingStep = (p: UIMessage["parts"][number]): p is ToolUIPart =>
  stepTypes.includes(p.type.replace(/^tool-/, "") as StepType) && "state" in p && p.state === "input-available";

export const lessons = ({ db, now, models, settings }: Deps & { settings: { alphaLesson: number } }) => {
  const find = async (id: string, userId: string) =>
    (await db.select().from(lesson).where(and(eq(lesson.id, id), eq(lesson.userId, userId))))[0];

  const withSteps = async (l: typeof lesson.$inferSelect) => ({
    ...l,
    steps: await db.select().from(step).where(eq(step.lessonId, l.id)).orderBy(asc(step.position)),
  });

  const openFocus = async (userId: string) =>
    (await db.select({ label: focusItem.label }).from(focusItem).where(and(eq(focusItem.userId, userId), eq(focusItem.status, "open")))).map(
      (f) => f.label,
    );

  // Runs the judge once, stores its verdict, moves the practised skills and checks the Unit's progress.
  async function completeLesson(row: typeof lesson.$inferSelect) {
    const at = now();
    const [steps, [u]] = await Promise.all([
      db
        .select({ type: step.type, input: step.input, output: step.output, feedback: step.feedback })
        .from(step)
        .where(eq(step.lessonId, row.id))
        .orderBy(asc(step.position)),
      row.unitId ? db.select({ objective: unit.objective, skills: unit.skills }).from(unit).where(eq(unit.id, row.unitId)) : [],
    ]);

    let judged: z.infer<typeof judgeOutput> | undefined;
    try {
      ({ output: judged } = await generate({ db, now }, row.userId, {
        model: models.judge,
        instructions: judgeInstructions,
        prompt: JSON.stringify({ lesson: { objective: row.objective }, unit: u, steps }),
        output: Output.object({ schema: judgeOutput }),
      }));
    } catch (e) {
      // The Lesson still counts as done; it just doesn't move the Skill Profile or the Unit.
      if (!NoObjectGeneratedError.isInstance(e)) throw e;
      console.error("lesson judge failed", e);
    }

    await db
      .update(lesson)
      .set({ status: "completed", completedAt: at, objectiveProgress: judged?.objectiveProgress, summary: judged?.summary })
      .where(eq(lesson.id, row.id));
    if (!judged) return;
    const scores = Object.fromEntries(Object.entries(judged.skills).flatMap(([s, r]) => (r ? [[s, r.score]] : [])));
    await recordScores(db, row.userId, scores, { alpha: settings.alphaLesson, source: "lesson", sourceId: row.id, at });
    if (row.unitId) await progressUnit({ db }, row.unitId);
  }

  return new Hono<AppEnv>()
    // Resumes the Lesson in progress in the active Unit, or generates the next one.
    .post("/next", async (c) => {
      const userId = c.var.user.id;
      const [active] = await db.select().from(unit).where(and(eq(unit.userId, userId), eq(unit.status, "active")));
      if (!active) return c.json({ error: "There's no active Unit" }, 409);

      const inUnit = await db.select().from(lesson).where(eq(lesson.unitId, active.id)).orderBy(asc(lesson.position));
      const current = inUnit.find((l) => l.status === "in_progress");
      if (current) return c.json(await withSteps(current));

      let plan: z.infer<typeof planOutput>;
      try {
        ({ output: plan } = await generate({ db, now }, userId, {
          model: models.step,
          instructions: planInstructions,
          prompt: JSON.stringify({
            unit: { title: active.title, objective: active.objective, skills: active.skills },
            skillProfile: await skillProfile(db, userId),
            focusItems: await openFocus(userId),
            earlierLessons: inUnit.filter((l) => l.summary).map((l) => ({ title: l.title, summary: l.summary })),
          }),
          output: Output.object({ schema: planOutput }),
        }));
      } catch (e) {
        if (NoObjectGeneratedError.isInstance(e)) return c.json({ error: "The Lesson couldn't be generated. Try again." }, 502);
        throw e;
      }
      const [created] = await db
        .insert(lesson)
        .values({ userId, unitId: active.id, position: inUnit.length, kind: "practice", ...plan, startedAt: now() })
        .returning();
      return c.json(await withSteps(created!), 201);
    })
    .get("/:id", async (c) => {
      const row = await find(c.req.param("id"), c.var.user.id);
      return row ? c.json(await withSteps(row)) : c.json({ error: "Lesson not found" }, 404);
    })
    // One turn. The body carries the newest message: a user message, or the last assistant message with the Step answered.
    .post("/:id/chat", zValidator("json", z.object({ message: z.any() })), async (c) => {
      const userId = c.var.user.id;
      const row = await find(c.req.param("id"), userId);
      if (!row) return c.json({ error: "Lesson not found" }, 404);
      if (row.status !== "in_progress") return c.json({ error: "This Lesson has ended" }, 409);

      const stored = row.messages as UIMessage[];
      const incoming = c.req.valid("json").message;
      const last = stored.at(-1);
      const pending = last?.role === "assistant" ? last.parts.find(isPendingStep) : undefined;

      let messages: UIMessage[];
      let answered: { type: StepType; input: any; output: z.infer<typeof textAnswer>; grade: ReturnType<typeof grade> } | undefined;
      if (pending) {
        if (incoming?.role !== "assistant" || incoming.id !== last!.id) return c.json({ error: "Answer the current Step first" }, 409);
        // Only the answer is taken from the client; the Step itself comes from what the server stored.
        const sent = incoming.parts?.find?.((p: any) => p.toolCallId === pending.toolCallId);
        const type = pending.type.replace(/^tool-/, "") as StepType;
        const output = textAnswer.safeParse(sent?.output);
        if (!output.success) return c.json({ error: "That answer isn't valid", issues: output.error.issues }, 400);
        const g = grade(type, pending.input, output.data);
        answered = { type, input: pending.input, output: output.data, grade: g };
        const done = { ...pending, state: "output-available", output: { ...output.data, ...(g && { grade: g }) } };
        messages = [...stored.slice(0, -1), { ...last!, parts: last!.parts.map((p) => (p === pending ? done : p)) } as UIMessage];
      } else {
        if (incoming?.role !== "user") return c.json({ error: "Expected a message from the Learner" }, 400);
        messages = [...stored, incoming];
      }

      const tools = {
        ...stepTools,
        giveFeedback: tool({
          description: "Feedback on the Step the Learner just answered.",
          inputSchema: feedbackInput,
          execute: async (fb) => {
            if (!stepId) return { saved: false };
            // The server's grade wins over the model's verdict for Steps it can check.
            const verdict = answered?.grade ? (answered.grade.correct ? "correct" : "incorrect") : fb.verdict;
            await db.update(step).set({ feedback: { ...fb, verdict } }).where(eq(step.id, stepId));
            return { saved: true, verdict };
          },
        }),
        endLesson: tool({
          description: "End the Lesson.",
          inputSchema: z.object({}),
          execute: async () => {
            await completeLesson(row);
            return { ended: true };
          },
        }),
      };

      const valid = await safeValidateUIMessages({ messages, tools });
      if (!valid.success) return c.json({ error: valid.error.message }, 400);

      let stepId: string | undefined;
      const [{ n: before }] = (await db.select({ n: count() }).from(step).where(eq(step.lessonId, row.id))) as [{ n: number }];
      if (answered) {
        const g = answered.grade;
        const [s] = await db
          .insert(step)
          .values({
            userId,
            lessonId: row.id,
            position: before,
            type: answered.type,
            input: answered.input,
            output: answered.output,
            feedback: g && { verdict: g.correct ? "correct" : "incorrect", corrected: g.expected, explanation: "" },
            answeredAt: now(),
          })
          .returning({ id: step.id });
        stepId = s!.id;
      }
      const answeredCount = before + (answered ? 1 : 0);

      // endLesson is hidden until 3 Steps and forced at 10.
      const activeTools: (keyof typeof tools)[] = answered ? ["giveFeedback"] : [];
      if (answeredCount >= MAX_STEPS) activeTools.push("endLesson");
      else activeTools.push(...stepTypes, ...(answeredCount >= MIN_STEPS ? (["endLesson"] as const) : []));

      const briefs = await db
        .select({ brief: goal.brief })
        .from(goal)
        .where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")));

      return streamChat({ db, now }, userId, {
        model: models.step,
        instructions: chatInstructions(row, briefs.flatMap((b) => (b.brief ? [b.brief] : [])), await openFocus(userId), answeredCount),
        messages: valid.data,
        tools,
        activeTools,
        toolChoice: answeredCount >= MAX_STEPS ? "required" : "auto",
        save: (messages) => db.update(lesson).set({ messages }).where(eq(lesson.id, row.id)),
      });
    });
};
