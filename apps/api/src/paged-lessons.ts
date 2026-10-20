import { schema } from "@impromptu/db";
import { Output } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { generate } from "./ai";
import type { Deps } from "./app";
import { skillProfile } from "./scoring";

const { lesson, unit, goal, focusItem, learnerMemory, assessmentJob: job } = schema;
type Ctx = Pick<Deps, "db" | "now" | "models"> & { signal?: AbortSignal };

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
const needsKey = new Set<string>(["fillGap", "multipleChoice", "matchPairs", "reorder"]);
const DEFAULT_PAGES = 5;
const WORD_CAP = 150;
const MAX_RETRIES = 2;

const text = z.string().trim().min(1).max(2000);
export const planOutput = z.object({
  pages: z.array(z.object({ idea: text, block: z.enum(blockTypes) })).min(1),
});
// answerKey is what the later question for this Page is graded on; it is never sent to the Learner.
export const pageOutput = z.object({ title: text, body: text, example: text.nullable(), answerKey: text.nullable() });
type PageOutput = z.infer<typeof pageOutput>;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Cheap rules on top of the schema. Returns a reason, or undefined when the Page is fine. */
export function pageProblem(page: PageOutput, block: string) {
  if (words(`${page.body} ${page.example ?? ""}`) > WORD_CAP) return `over ${WORD_CAP} words`;
  const key = page.answerKey?.trim();
  if (needsKey.has(block) && !key) return "missing answerKey";
  if (key) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(`${page.title} ${page.body} ${page.example ?? ""}`))
      return "answerKey appears in the reading";
  }
}

type Stored = PageOutput & { block: string };
const blank = { title: "", body: "", example: null };

/** What a Learner may see: no answer keys. Pending Pages are listed without content. */
export function publicPages(l: typeof lesson.$inferSelect) {
  return (l.pageStatus ?? []).map((s, i) => {
    const page = l.material?.[i] as Stored | undefined;
    return {
      page: i,
      status: s.page,
      ...(s.page === "ready" &&
        page && { title: page.title, body: page.body, example: page.example, block: page.block }),
    };
  });
}

const pending = (n: number) =>
  Array.from({ length: n }, () => ({ page: "pending" as const, question: "pending" as const }));

/** Reserves the Learner's next outlined Lesson and queues its generation. Starting twice returns the same Lesson. */
export async function startLesson({ db, now }: Pick<Deps, "db" | "now">, userId: string, position: number) {
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
    if (existing)
      return existing.contentVersion === 2 ? { lesson: existing } : { error: "Lesson already prepared" as const };
    const next = active.lessonOutline.find(
      (p) => !rows.some((l) => l.position === p.position && l.status === "completed"),
    );
    if (next?.position !== position) return { error: "Finish your earlier Lessons first" as const };
    // The outline's pageCount arrives with ticket #137; until then every Lesson has 5 Pages.
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
        contentVersion: 2,
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

/** A failed Lesson goes back to pending and runs again from the planner. */
export async function retryLesson({ db, now }: Pick<Deps, "db" | "now">, userId: string, lessonId: string) {
  return db.transaction(async (tx) => {
    const [l] = await tx
      .select()
      .from(lesson)
      .where(and(eq(lesson.id, lessonId), eq(lesson.userId, userId), eq(lesson.contentVersion, 2)))
      .for("update");
    if (!l || l.preparation !== "failed") return;
    const [row] = await tx
      .update(lesson)
      .set({
        preparation: "preparing",
        preparationToken: crypto.randomUUID(),
        preparationAt: now(),
        pageStatus: pending(l.pageStatus!.length),
        material: l.pageStatus!.map(() => blank),
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
  if (!row || row.contentVersion !== 2 || row.preparation !== "preparing") return;
  const token = row.preparationToken!;
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
    const [[active], goals, focus, memory, profile] = await Promise.all([
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
    ]);
    const base = { model: models.step, reasoning: "low" as const, abortSignal: ctx.signal };
    const { output: plan } = await generate(ctx, row.userId, {
      ...base,
      instructions: `Plan one short English Lesson of exactly ${total} Pages. Each Page teaches one idea and uses one Block type (${blockTypes.join(", ")}). Build up from simple to practised, and adapt to the Learner's evidence, Focus Items and memory.`,
      prompt: JSON.stringify({
        unit: { title: active?.title, objective: active?.objective },
        lesson: { title: row.title, objective: row.objective },
        goals,
        skillProfile: profile,
        focusItems: focus.map((f) => f.label),
        learnerMemory: memory[0]?.summary ?? "",
      }),
      output: Output.object({ schema: planOutput }),
    });
    const pages = planOutput.parse(plan).pages;
    if (pages.length !== total) throw new Error(`Planner returned ${pages.length} Pages, wanted ${total}`);
    const hint = levelHint(profile);

    // Each writer sees only its own slice. A Page that fails its checks retries alone.
    const write = async (i: number) => {
      const slice = pages[i]!;
      for (let tries = 0; tries <= MAX_RETRIES; tries++) {
        try {
          const { output } = await generate(ctx, row.userId, {
            ...base,
            instructions: `Write one Page of an English Lesson in at most ${WORD_CAP} words in total. ${hint} Teach only this idea, for this Block type: ${slice.block}. The reading must teach without containing the answerKey, the exact word or phrase the Learner will later be asked for (null for reading, vocabCard, rewrite and speakPrompt).`,
            prompt: JSON.stringify({ lesson: row.title, page: i + 1, of: total, ...slice }),
            output: Output.object({ schema: pageOutput }),
          });
          const page = pageOutput.parse(output);
          const problem = pageProblem(page, slice.block);
          if (problem) {
            console.error(`Lesson ${lessonId} page ${i + 1} attempt ${tries + 1} rejected: ${problem}`);
            continue;
          }
          await db.transaction(async (tx) => {
            const [cur] = await tx.select().from(lesson).where(mine).for("update");
            if (!cur) return;
            const material = [...(cur.material ?? [])];
            material[i] = { ...page, block: slice.block } as Stored;
            const pageStatus = cur.pageStatus!.map((s, j) => (j === i ? { ...s, page: "ready" as const } : s));
            const done = pageStatus.every((s) => s.page === "ready");
            await tx
              .update(lesson)
              .set({ material, pageStatus, ...(done && { preparation: "ready", preparationToken: null }) })
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
    const ok = await Promise.all(pages.map((_, i) => write(i)));
    if (ok.includes(false)) await fail(ok.map((v) => !v));
  } catch (error) {
    // Planner or database trouble: the job retries, and its last attempt fails the Lesson.
    if (attempt >= 3) await fail();
    throw error;
  }
}
