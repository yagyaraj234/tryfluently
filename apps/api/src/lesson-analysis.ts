import { schema } from "@fluently/db";
import { Output } from "ai";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { generate } from "./ai";
import type { Deps } from "./app";
import { addFocusItems, remember } from "./learning-memory";

const { lesson, step, assessmentJob: job } = schema;
type Ctx = Pick<Deps, "db" | "now" | "models"> & { signal?: AbortSignal };

export const analysisOutput = z.object({
  summary: z.string(),
  focusItems: z.array(z.object({ label: z.string(), kind: z.enum(["grammar", "vocabulary", "phrase"]) })).nullable(),
});

const instructions = `You are an examiner for English as a second language. Read what a Learner answered in one finished Lesson
and the feedback they got. Write a short two-sentence summary the next Lesson can build on, written to the Learner ("You ...").
If the Learner made the same mistake more than once, add it as a Focus Item with a short label and its kind. Otherwise return none.`;

/** Runs one `lesson_analysis` job. Generation stays outside the transaction; the Learner lock covers the writes. */
export async function analyseLesson({ db, now, models, signal }: Ctx, lessonId: string) {
  const [row] = await db.select().from(lesson).where(eq(lesson.id, lessonId));
  if (!row || row.contentVersion !== 2 || row.summary) return;
  const steps = await db
    .select({
      position: step.position,
      type: step.type,
      input: step.input,
      output: step.output,
      feedback: step.feedback,
    })
    .from(step)
    .where(eq(step.lessonId, lessonId))
    .orderBy(asc(step.position));
  const { output } = await generate({ db, now }, row.userId, {
    model: models.judge,
    abortSignal: signal,
    instructions,
    prompt: JSON.stringify({ lesson: { title: row.title, objective: row.objective }, steps }),
    output: Output.object({ schema: analysisOutput }),
  });
  const { summary, focusItems } = analysisOutput.parse(output);
  const at = now();
  await db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, row.userId)).for("update");
    const [cur] = await tx.select().from(lesson).where(eq(lesson.id, lessonId)).for("update");
    if (!cur || cur.summary) return;
    await tx.update(lesson).set({ summary }).where(eq(lesson.id, lessonId));
    if (focusItems?.length)
      await addFocusItems(
        tx,
        row.userId,
        focusItems.map((f) => ({
          userId: row.userId,
          ...f,
          source: "lesson" as const,
          sourceId: lessonId,
          createdAt: at,
        })),
      );
    await remember(tx, row.userId, `${row.title}: ${summary}`, at);
  });
}

export const ANALYSIS_WAIT_MS = 5_000;
const POLL_MS = 250;
export type Clock = { now: () => number; sleep: (ms: number) => Promise<void> };
const realClock: Clock = { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** Waits until the Learner has no analysis queued or running, up to `ms`. Returns false when it gave up. */
export async function waitForAnalysis(
  db: Deps["db"],
  userId: string,
  { ms = ANALYSIS_WAIT_MS, clock = realClock }: { ms?: number; clock?: Clock } = {},
) {
  const deadline = clock.now() + ms;
  for (;;) {
    const busy = await db
      .select({ id: job.id })
      .from(job)
      .where(and(eq(job.userId, userId), eq(job.kind, "lesson_analysis"), inArray(job.status, ["pending", "running"])))
      .limit(1);
    if (!busy.length) return true;
    if (clock.now() >= deadline) return false;
    await clock.sleep(POLL_MS);
  }
}
