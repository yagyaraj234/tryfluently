import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { NoObjectGeneratedError, Output, safeValidateUIMessages, tool, type UIMessage } from "ai";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate, streamChat } from "./ai";
import type { AppEnv, Deps } from "./app";
import { completeLesson } from "./completion";
import { findRecording, recordedSecondsToday, recordingForm, timingOf, type Timing } from "./recordings";
import { createRoleplay, roleplayKindFor } from "./roleplays";
import { skillProfile } from "./scoring";
import { stepTools, stepTypes, takeAnswer } from "./steps";

const { lesson, step, unit, goal, focusItem } = schema;

const MIN_STEPS = 3;
const MAX_STEPS = 10;
const HITS_TO_CLOSE = 3;
const ROLEPLAY_AT = 80;

const feedbackInput = z.object({
  verdict: z.enum(["correct", "almost", "incorrect"]),
  corrected: z.string(),
  explanation: z.string(),
  focusItemIds: z.array(z.string()).optional().describe("Ids of open Focus Items the Learner used correctly in this answer"),
});

const planOutput = z.object({ title: z.string(), objective: z.string() });

const planInstructions = `You plan the next short Lesson (3–10 Steps) in a Unit of an English coaching Roadmap.
Give it a title and one concrete objective. Build on the earlier Lessons' summaries without repeating them,
and work in the Learner's open Focus Items where they fit the Unit.`;

type Focus = { id: string; label: string };

const chatInstructions = (l: { objective: string }, briefs: string[], focus: Focus[], answered: number) =>
  `You are Impromptu, an English coach, running a short Lesson made of Steps.
Lesson objective: ${l.objective}
${briefs.length ? `What you know about the Learner:\n${briefs.join("\n\n")}` : ""}
${focus.length ? `Their open Focus Items, to weave in where natural (id: label):\n${focus.map((f) => `${f.id}: ${f.label}`).join("\n")}` : ""}
Steps answered so far: ${answered}.
Each turn: if the Learner just answered a Step, first call giveFeedback with a verdict, the corrected version, a
one-sentence explanation and the ids of any open Focus Items the answer used correctly. Then call exactly one Step tool for the next Step, adapting to how they did.
fillGap answers are already graded on the server: use its verdict. Keep any text short.
Once the objective has been practised enough, call endLesson.`;

export const lessons = ({
  db,
  now,
  models,
  transcriber,
  settings,
}: Deps & { settings: { alphaLesson: number; recordingMinutesPerDay: number } }) => {
  const find = async (id: string, userId: string) =>
    (await db.select().from(lesson).where(and(eq(lesson.id, id), eq(lesson.userId, userId))))[0];

  const withSteps = async (l: typeof lesson.$inferSelect) => ({
    ...l,
    steps: await db.select().from(step).where(eq(step.lessonId, l.id)).orderBy(asc(step.position)),
  });

  const openFocus = (userId: string) =>
    db
      .select({ id: focusItem.id, label: focusItem.label })
      .from(focusItem)
      .where(and(eq(focusItem.userId, userId), eq(focusItem.status, "open")));

  // One hit per Focus Item used correctly; the 3rd closes it. Only the Learner's own open items count.
  async function countHits(userId: string, ids: string[]) {
    if (!ids.length) return;
    const closes = sql`${focusItem.hits} + 1 >= ${HITS_TO_CLOSE}`;
    await db
      .update(focusItem)
      .set({
        hits: sql`${focusItem.hits} + 1`,
        status: sql`case when ${closes} then 'closed'::focus_status else 'open'::focus_status end`,
        closedAt: sql`case when ${closes} then ${now().toISOString()}::timestamp end`,
      })
      .where(and(eq(focusItem.userId, userId), eq(focusItem.status, "open"), inArray(focusItem.id, [...new Set(ids)])));
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

      // A Unit that ends with a Roleplay gets one once a practice Lesson reaches 80+ on the objective;
      // a Roleplay at 80+ after it then masters the Unit.
      const lastDone = inUnit.findLast((l) => l.status === "completed");
      if (active.endsWithRoleplay && lastDone?.kind === "practice" && (lastDone.objectiveProgress ?? 0) >= ROLEPLAY_AT) {
        const kind = await roleplayKindFor({ db }, userId);
        return c.json(await withSteps(await createRoleplay({ db, now }, userId, { kind, unitId: active.id, position: inUnit.length })), 201);
      }

      let plan: z.infer<typeof planOutput>;
      try {
        ({ output: plan } = await generate({ db, now }, userId, {
          model: models.step,
          instructions: planInstructions,
          prompt: JSON.stringify({
            unit: { title: active.title, objective: active.objective, skills: active.skills },
            skillProfile: await skillProfile(db, userId),
            focusItems: (await openFocus(userId)).map((f) => f.label),
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
    // Transcribes a recorded answer. The client then returns the recordingId as the Step's answer.
    .post("/:id/recordings", zValidator("form", recordingForm), async (c) => {
      const user = c.var.user;
      const row = await find(c.req.param("id"), user.id);
      if (!row) return c.json({ error: "Lesson not found" }, 404);
      if (row.status !== "in_progress") return c.json({ error: "This Lesson has ended" }, 409);
      if ((await recordedSecondsToday(db, user, now())) >= settings.recordingMinutesPerDay * 60)
        return c.json({ error: "You've used today's recorded minutes. Answer in text, or come back tomorrow." }, 429);

      const { audio, seconds } = c.req.valid("form");
      let text: string;
      try {
        ({ text } = await transcriber.transcribe(audio));
      } catch (e) {
        console.error("transcription failed", e);
        return c.json({ error: "The recording couldn't be transcribed. Try again." }, 502);
      }
      const recordingId = crypto.randomUUID();
      const timing = timingOf(text, seconds);
      await db
        .insert(schema.aiUsage)
        .values({ userId: user.id, kind: "recording", callId: recordingId, startedAt: now(), seconds, usage: { lessonId: row.id, text, timing } });
      return c.json({ recordingId, text, timing }, 201);
    })
    // One turn. The body carries the newest message: a user message, or the last assistant message with the Step answered.
    .post("/:id/chat", zValidator("json", z.object({ message: z.any() })), async (c) => {
      const userId = c.var.user.id;
      const row = await find(c.req.param("id"), userId);
      if (!row) return c.json({ error: "Lesson not found" }, 404);
      if (row.status !== "in_progress") return c.json({ error: "This Lesson has ended" }, 409);
      if (row.kind === "roleplay") return c.json({ error: "A Roleplay runs through /api/roleplays" }, 409);

      // A recorded answer points at a recording the server transcribed; the transcript stands in as the answer.
      const incoming = c.req.valid("json").message;
      let voice: Timing | undefined;
      const recorded = incoming?.parts?.find?.((p: any) => typeof p?.output?.recordingId === "string");
      if (recorded) {
        const recording = await findRecording(db, userId, row.id, recorded.output.recordingId);
        if (!recording) return c.json({ error: "That recording wasn't found" }, 400);
        recorded.output = { answer: recording.text };
        voice = recording.timing;
      }

      const taken = takeAnswer(row.messages as UIMessage[], incoming);
      if ("error" in taken) return c.json({ error: taken.error, issues: taken.issues }, taken.status);
      const { messages, answered } = taken;

      const tools = {
        ...stepTools,
        giveFeedback: tool({
          description: "Feedback on the Step the Learner just answered.",
          inputSchema: feedbackInput,
          execute: async (fb) => {
            if (!stepId) return { saved: false };
            // The server's grade wins over the model's verdict for Steps it can check.
            const verdict = answered?.grade ? (answered.grade.correct ? "correct" : "incorrect") : fb.verdict;
            const { focusItemIds = [], ...feedback } = fb;
            await db.update(step).set({ feedback: { ...feedback, verdict } }).where(eq(step.id, stepId));
            await countHits(userId, focusItemIds);
            return { saved: true, verdict };
          },
        }),
        endLesson: tool({
          description: "End the Lesson.",
          inputSchema: z.object({}),
          execute: async () => {
            await completeLesson({ db, now, models, settings }, row.id, row.userId);
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
            mode: voice ? "voice" : "text",
            timing: voice,
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
