import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { NoObjectGeneratedError, Output, safeValidateUIMessages, tool, type UIMessage } from "ai";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate, streamChat } from "./ai";
import type { AppEnv, Deps } from "./app";
import { goalText } from "./goal-text";
import { answerPage, setCurrentPage, stepsOf } from "./page-answers";
import { publicPages, retryLesson, startLesson } from "./paged-lessons";
import { prepareNext } from "./preparation";
import { completeLesson } from "./completion";
import { finishPagedLesson } from "./paged-finish";
import { findRecording, recordedSecondsToday, recordingForm, timingOf, type Timing } from "./recordings";
import { createRoleplay, roleplayKindFor } from "./roleplays";
import { readyForRoleplay } from "./roadmap";
import { skillProfile } from "./scoring";
import { stepTools, stepTypes, takeAnswer } from "./steps";

const { lesson, step, unit, goal, focusItem } = schema;

const MIN_STEPS = 3;
const MAX_STEPS = 10;
const HITS_TO_CLOSE = 3;

const feedbackInput = z.object({
  verdict: z.enum(["correct", "almost", "incorrect"]),
  corrected: z.string(),
  explanation: z.string(),
  focusItemIds: z
    .array(z.string())
    .optional()
    .describe("Ids of open Focus Items the Learner used correctly in this answer"),
});

export const planOutput = z.object({ title: z.string(), objective: z.string() });

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
fillGap, fillGaps and reorder answers are already graded on the server: use its verdict.
For every Step, include teaching: a short title, a clear explanation (2–4 sentences), and an optional example.
Teach the idea without revealing the Step answer. Vary Step types naturally: fillGaps for related contrasts,
reorder for sentence parts or conversation turns, rewrite, vocabulary and speaking where useful. Keep any text short.
Once the objective has been practised enough, call endLesson.`;

export const lessons = ({
  db,
  now,
  models,
  transcriber,
  settings,
}: Deps & { settings: { alphaLesson: number; recordingMinutesPerDay: number } }) => {
  const find = async (id: string, userId: string) =>
    (
      await db
        .select()
        .from(lesson)
        .where(and(eq(lesson.id, id), eq(lesson.userId, userId)))
    )[0];

  const withSteps = async (l: typeof lesson.$inferSelect) => {
    const rows = await db.select().from(step).where(eq(step.lessonId, l.id)).orderBy(asc(step.position));
    if (!l.preparation) return { ...l, questions: null, steps: rows };
    const safe = rows.map((s) => {
      const { answer, answers, order, ...input } = s.input;
      return { ...s, input, feedback: l.status === "completed" ? s.feedback : null };
    });
    const { preparationToken, ...view } = l;
    if (l.contentVersion === 2) return { ...view, material: publicPages(l, rows), questions: [], steps: [] };
    return { ...view, questions: safe, steps: safe };
  };

  const pagesView = async (l: typeof lesson.$inferSelect) => ({
    id: l.id,
    preparation: l.preparation,
    currentPage: l.currentPage,
    status: l.status,
    pages: publicPages(l, await stepsOf(db, l.id)),
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

  return (
    new Hono<AppEnv>()
      // Resumes the Lesson in progress in the active Unit, or generates the next one.
      .post("/next", async (c) => {
        const userId = c.var.user.id;
        const [active] = await db
          .select()
          .from(unit)
          .where(and(eq(unit.userId, userId), eq(unit.status, "active")));
        if (!active) return c.json({ error: "There's no active Unit" }, 409);

        if (active.lessonOutline.length) {
          const prepared = await prepareNext({ db, now, models }, userId);
          if (!prepared) return c.json({ error: "No Lesson is available" }, 409);
          if (prepared.preparation === "failed")
            return c.json({ error: "The Lesson couldn't be prepared. Try again." }, 502);
          if (prepared.preparation === "preparing") return c.json({ error: "Your Lesson is still preparing" }, 409);
          if (!prepared.startedAt) await db.update(lesson).set({ startedAt: now() }).where(eq(lesson.id, prepared.id));
          return c.json(await withSteps({ ...prepared, startedAt: prepared.startedAt ?? now() }));
        }
        const inUnit = await db.select().from(lesson).where(eq(lesson.unitId, active.id)).orderBy(asc(lesson.position));
        const current = inUnit.find((l) => l.status === "in_progress");
        if (current) return c.json(await withSteps(current));

        // A Unit that ends with a Roleplay gets one once a practice Lesson reaches 80+ on the objective;
        // a Roleplay at 80+ after it then masters the Unit.
        if (readyForRoleplay(active.endsWithRoleplay, inUnit)) {
          const kind = await roleplayKindFor({ db }, userId);
          return c.json(
            await withSteps(
              await createRoleplay({ db, now }, userId, {
                kind,
                unitId: active.id,
                position: inUnit.length,
                plan: active.lessonOutline.find((l) => l.kind === "roleplay"),
              }),
            ),
            201,
          );
        }

        const planned = active.lessonOutline.find(
          (l) => l.kind === "practice" && l.position === inUnit.filter((l) => l.kind === "practice").length,
        );
        let plan: z.infer<typeof planOutput>;
        try {
          ({ output: plan } = await generate({ db, now }, userId, {
            model: models.step,
            instructions: planInstructions,
            prompt: JSON.stringify({
              unit: { title: active.title, objective: active.objective, skills: active.skills },
              plannedLesson: planned,
              skillProfile: await skillProfile(db, userId),
              focusItems: (await openFocus(userId)).map((f) => f.label),
              earlierLessons: inUnit.filter((l) => l.summary).map((l) => ({ title: l.title, summary: l.summary })),
            }),
            output: Output.object({ schema: planOutput }),
          }));
        } catch (e) {
          if (NoObjectGeneratedError.isInstance(e))
            return c.json({ error: "The Lesson couldn't be generated. Try again." }, 502);
          throw e;
        }
        const [created] = await db
          .insert(lesson)
          .values({
            userId,
            unitId: active.id,
            position: inUnit.length,
            kind: "practice",
            ...plan,
            ...(planned && { title: planned.title }),
            startedAt: now(),
          })
          .returning();
        return c.json(await withSteps(created!), 201);
      })
      // Starts a Lesson from the outline. Starting twice returns the same Lesson.
      .post("/:position{[0-9]+}/start", async (c) => {
        const r = await startLesson({ db, now }, c.var.user.id, Number(c.req.param("position")));
        if ("error" in r) return c.json({ error: r.error }, 409);
        return c.json(await pagesView(r.lesson), r.created ? 201 : 200);
      })
      .post("/:id/retry", async (c) => {
        const r = await retryLesson({ db, now }, c.var.user.id, c.req.param("id"));
        return r ? c.json(await pagesView(r), 202) : c.json({ error: "Only a failed Lesson can be retried" }, 409);
      })
      // Polled while Pages are written: which are ready, with their content so far (never answer keys).
      .get("/:id/pages", async (c) => {
        const row = await find(c.req.param("id"), c.var.user.id);
        return row?.contentVersion === 2 ? c.json(await pagesView(row)) : c.json({ error: "Lesson not found" }, 404);
      })
      // The end screen polls this: the background analysis status and, once it is done, the short summary.
      .get("/:id/analysis", async (c) => {
        const row = await find(c.req.param("id"), c.var.user.id);
        if (row?.contentVersion !== 2) return c.json({ error: "Lesson not found" }, 404);
        const [work] = await db
          .select({ status: schema.assessmentJob.status })
          .from(schema.assessmentJob)
          .where(and(eq(schema.assessmentJob.lessonId, row.id), eq(schema.assessmentJob.kind, "lesson_analysis")));
        return c.json({ status: work?.status ?? null, summary: row.summary });
      })
      // Grades a paged Lesson's Page on the server and returns the verdict, correct answer and explanation straight away.
      // The `answer` shape depends on the Block (see page-answers.ts). Sending it again returns the first result.
      .post("/:id/pages/:index{[0-9]+}/answer", zValidator("json", z.object({ answer: z.unknown() })), async (c) => {
        const r = await answerPage(
          { db, now },
          c.var.user.id,
          c.req.param("id"),
          Number(c.req.param("index")),
          c.req.valid("json").answer,
        );
        return "error" in r ? c.json({ error: r.error }, r.status) : c.json(r.result, r.status);
      })
      // Remembers which Page the Learner is on (0-based; the recap is one past the last Page) so a return visit resumes there.
      .patch("/:id/page", zValidator("json", z.object({ page: z.number().int().min(0) })), async (c) => {
        const ok = await setCurrentPage(db, c.var.user.id, c.req.param("id"), c.req.valid("json").page);
        return ok ? c.json({ currentPage: c.req.valid("json").page }) : c.json({ error: "Page not found" }, 404);
      })
      .get("/:id", async (c) => {
        const row = await find(c.req.param("id"), c.var.user.id);
        return row ? c.json(await withSteps(row)) : c.json({ error: "Lesson not found" }, 404);
      })
      .post("/:id/assessment", async (c) => {
        const row = await find(c.req.param("id"), c.var.user.id);
        if (!row) return c.json({ error: "Lesson not found" }, 404);
        if (row.preparation !== "ready" || row.status !== "in_progress")
          return c.json({ error: "Lesson isn't ready" }, 409);
        await db
          .update(lesson)
          .set({ phase: "assessment", startedAt: row.startedAt ?? now() })
          .where(eq(lesson.id, row.id));
        return c.json({ phase: "assessment" });
      })
      .post(
        "/:id/answers",
        zValidator(
          "json",
          z
            .object({
              stepId: z.string(),
              answer: z.string().trim().min(1).max(2000).optional(),
              recordingId: z.string().optional(),
            })
            .refine((v) => Boolean(v.answer) !== Boolean(v.recordingId)),
        ),
        async (c) => {
          const userId = c.var.user.id;
          const row = await find(c.req.param("id"), userId);
          if (!row) return c.json({ error: "Lesson not found" }, 404);
          if (row.preparation !== "ready" || row.phase !== "assessment" || row.status !== "in_progress")
            return c.json({ error: "Start the assessment first" }, 409);
          const input = c.req.valid("json");
          const recording = input.recordingId ? await findRecording(db, userId, row.id, input.recordingId) : undefined;
          if (input.recordingId && !recording) return c.json({ error: "Recording not found" }, 400);
          const saved = await db.transaction(async (tx) => {
            const [locked] = await tx.select().from(lesson).where(eq(lesson.id, row.id)).for("update");
            if (locked?.status !== "in_progress") return "ended";
            const rows = await tx.select().from(step).where(eq(step.lessonId, row.id)).orderBy(asc(step.position));
            const question = rows.find((s) => s.id === input.stepId);
            if (!question) return "missing";
            if (question.answeredAt)
              return question.output?.answer === (recording?.text ?? input.answer) ? "saved" : "ended";
            if (rows.find((s) => !s.answeredAt)?.id !== question.id) return "ended";
            const pending = {
              id: "question",
              role: "assistant" as const,
              parts: [
                {
                  type: `tool-${question.type}`,
                  toolCallId: question.id,
                  state: "input-available",
                  input: question.input,
                },
              ],
            } as UIMessage;
            const answer = recording?.text ?? input.answer!;
            const taken = takeAnswer([pending], { ...pending, parts: [{ ...pending.parts[0], output: { answer } }] });
            if ("error" in taken || !taken.answered) return "invalid";
            const grade = taken.answered.grade;
            await tx
              .update(step)
              .set({
                output: { answer },
                answeredAt: now(),
                mode: recording ? "voice" : "text",
                timing: recording?.timing,
                feedback: grade
                  ? {
                      verdict: grade.correct ? "correct" : "incorrect",
                      corrected: grade.expected,
                      explanation: "Compared with the expected answer.",
                    }
                  : null,
              })
              .where(eq(step.id, question.id));
            return "saved";
          });
          if (saved === "missing") return c.json({ error: "Question not found" }, 404);
          if (saved !== "saved")
            return c.json(
              { error: "Answer the current question with a valid answer" },
              saved === "invalid" ? 400 : 409,
            );
          return c.json({ saved: true });
        },
      )
      .post("/:id/finish", async (c) => {
        const row = await find(c.req.param("id"), c.var.user.id);
        if (!row) return c.json({ error: "Lesson not found" }, 404);
        const paged = row.contentVersion === 2;
        if (row.preparation !== "ready" || (!paged && row.phase !== "assessment"))
          return c.json({ error: "Start the assessment first" }, 409);
        const rows = await db.select().from(step).where(eq(step.lessonId, row.id));
        if (rows.some((s) => !s.answeredAt)) return c.json({ error: "Answer every question first" }, 409);
        // A paged Lesson has one Step per question Page; all of them must be answered before it can finish.
        if (paged && rows.length < (row.material ?? []).filter((p: any) => p.question).length)
          return c.json({ error: "Answer every question first" }, 409);
        if (paged) return c.json(await finishPagedLesson({ db, now, settings }, row.id, row.userId));
        const result = await completeLesson({ db, now, models, settings }, row.id, row.userId);
        return result.status === "failed"
          ? c.json({ error: "Your report couldn't be prepared. Try again." }, 502)
          : c.json(result);
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
        await db.insert(schema.aiUsage).values({
          userId: user.id,
          kind: "recording",
          callId: recordingId,
          startedAt: now(),
          seconds,
          usage: { lessonId: row.id, text, timing },
        });
        return c.json({ recordingId, text, timing }, 201);
      })
      // One turn. The body carries the newest message: a user message, or the last assistant message with the Step answered.
      .post("/:id/chat", zValidator("json", z.object({ message: z.any() })), async (c) => {
        const userId = c.var.user.id;
        const row = await find(c.req.param("id"), userId);
        if (!row) return c.json({ error: "Lesson not found" }, 404);
        if (row.status !== "in_progress") return c.json({ error: "This Lesson has ended" }, 409);
        if (row.preparation) return c.json({ error: "Use the saved Lesson assessment" }, 409);
        if (row.kind === "roleplay") return c.json({ error: "A Roleplay runs through /api/roleplays" }, 409);

        // A recorded answer points at a recording the server transcribed; the transcript stands in as the answer.
        const incoming = c.req.valid("json").message;
        let voice: Timing | undefined;
        const recorded = Array.isArray(incoming?.parts)
          ? incoming.parts.find((p: any) => typeof p?.output?.recordingId === "string")
          : undefined;
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
              await db
                .update(step)
                .set({ feedback: { ...feedback, verdict } })
                .where(eq(step.id, stepId));
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
        const [{ n: before }] = (await db.select({ n: count() }).from(step).where(eq(step.lessonId, row.id))) as [
          { n: number },
        ];
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

        const goals = await db
          .select({ statement: goal.statement, brief: goal.brief })
          .from(goal)
          .where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")));

        return streamChat({ db, now }, userId, {
          model: models.step,
          instructions: chatInstructions(
            row,
            goals.flatMap((g) => {
              const text = goalText(g);
              return text ? [text] : [];
            }),
            await openFocus(userId),
            answeredCount,
          ),
          messages: valid.data,
          tools,
          activeTools,
          toolChoice: answeredCount >= MAX_STEPS ? "required" : "auto",
          save: (messages) => db.update(lesson).set({ messages }).where(eq(lesson.id, row.id)),
        });
      })
  );
};
