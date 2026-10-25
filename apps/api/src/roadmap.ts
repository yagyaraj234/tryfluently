import { schema } from "@fluently/db";
import { NoObjectGeneratedError, Output } from "ai";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate } from "./ai";
import type { AppEnv, Deps } from "./app";
import { skillProfile, skills } from "./scoring";

const { unit, goal, focusItem, lesson, assessment, step } = schema;

const outlineItem = z.object({
  title: z.string().min(1).max(100),
  objective: z.string().min(1).max(300),
  skill: z.enum(skills),
  kind: z.enum(["practice", "roleplay"]),
  estimatedMinutes: z.number().int().min(3).max(10),
  pageCount: z.number().int().min(4).max(6),
});
const outline = z.array(outlineItem).min(3).max(6);
const validOutline = (items: z.infer<typeof outline>, roleplay: boolean) =>
  items.filter((l) => l.kind === "practice").length >= 3 &&
  items.filter((l) => l.kind === "practice").length <= 5 &&
  items.filter((l) => l.kind === "roleplay").length === Number(roleplay) &&
  (!roleplay || items.at(-1)?.kind === "roleplay") &&
  new Set(items.map((l) => l.title.trim().toLowerCase())).size === items.length;
export const unitOutput = z
  .object({
    title: z.string(),
    objective: z.string(),
    skills: z.array(z.enum(skills)).min(1),
    endsWithRoleplay: z.boolean(),
    lessonOutline: outline,
  })
  .refine(
    (u) => validOutline(u.lessonOutline, u.endsWithRoleplay),
    "Each Unit needs distinct practice Lessons and its optional final Roleplay",
  );
export const outlineOutput = z.object({
  units: z
    .array(z.object({ id: z.string(), lessonOutline: outline }))
    .min(1)
    .max(10),
});

const outlineInstructions = `Give each Unit 3–5 distinct practice Lesson outlines with short, specific titles and objectives.
Vary the focus to fit the Unit and Learner: useful vocabulary, clearing up a misconception, rewriting, explaining an idea,
or speaking confidently. Do not repeat generic titles or the same sequence in every Unit.
Use kind practice, with skill grammar, vocabulary or fluency. If endsWithRoleplay, append exactly one final kind roleplay
outline with a specific conversation title; otherwise include no roleplay. Each Lesson is a short 3–10 minute sitting: give every outline an estimatedMinutes (3–10) and a pageCount (4–6 Pages,
about 1 minute each plus a recap). These are editable outlines, not generated Steps.`;

function positionedOutline(items: z.infer<typeof outline>, start = 0) {
  return items.map((item) => ({ ...item, position: start++ }));
}

export function readyForRoleplay(
  endsWithRoleplay: boolean,
  lessons: { status: string; kind: string; objectiveProgress: number | null }[],
) {
  const last = lessons.findLast((l) => l.status === "completed");
  return endsWithRoleplay && last?.kind === "practice" && (last.objectiveProgress ?? 0) >= 80;
}
export const roadmapOutput = z.object({ units: z.array(unitOutput).min(8).max(10) });

const roadmapInstructions = `You plan an English coaching Roadmap. Write 8–10 Units in order, each a focused topic with
a concrete objective the Learner can meet, the skills it practises (fluency, grammar, vocabulary), and whether it ends
with a Roleplay (a Mock Interview for interview practice, a Client Call for client work).
Fit the Units to the Learner's Goal statements and work from their weaknesses toward their Target Levels. ${outlineInstructions}`;

type Ctx = Pick<Deps, "db" | "now" | "models"> & { signal?: AbortSignal };

export const focusItemsRoute = (db: Deps["db"]) =>
  new Hono<AppEnv>().get("/", async (c) =>
    c.json(
      await db
        .select()
        .from(focusItem)
        .where(eq(focusItem.userId, c.var.user.id))
        .orderBy(asc(focusItem.createdAt), asc(focusItem.label)),
    ),
  );

// What the roadmap model sees: Goals (their statements, Briefs and Target Levels), the Skill Profile and open Focus Items.
export async function learnerSituation({ db }: Pick<Deps, "db">, userId: string) {
  const [goals, profile, focus] = await Promise.all([
    db
      .select({
        kind: goal.kind,
        statement: goal.statement,
        targetLevels: goal.targetLevels,
        brief: goal.brief,
      })
      .from(goal)
      .where(and(eq(goal.userId, userId), eq(goal.status, "confirmed"))),
    skillProfile(db, userId),
    db
      .select({ label: focusItem.label, kind: focusItem.kind })
      .from(focusItem)
      .where(and(eq(focusItem.userId, userId), eq(focusItem.status, "open"))),
  ]);
  return JSON.stringify({ goals, skillProfile: profile, focusItems: focus }, null, 2);
}

// Builds the Roadmap once the Learner has confirmed Goals, none left proposed, a Skill Profile, and no Units yet.
export async function buildRoadmap(ctx: Ctx, userId: string) {
  const { db, now, models } = ctx;
  const [existing] = await db.select({ id: unit.id }).from(unit).where(eq(unit.userId, userId)).limit(1);
  if (existing) return "exists" as const;
  const statuses = new Set(
    (await db.select({ status: goal.status }).from(goal).where(eq(goal.userId, userId))).map((g) => g.status),
  );
  const profile = await skillProfile(db, userId);
  if (!statuses.has("confirmed") || statuses.has("proposed") || Object.values(profile).every((s) => s === null))
    return "not_ready" as const;

  // The Report promised the Learner a first Unit; Unit 1 has to be that one.
  const [latest] = await db
    .select({ report: assessment.report })
    .from(assessment)
    .where(and(eq(assessment.userId, userId), eq(assessment.status, "completed")))
    .orderBy(desc(assessment.endedAt))
    .limit(1);
  const previewed = (latest?.report as { firstUnit?: { title: string; objective: string } } | null)?.firstUnit;

  let units: z.infer<typeof unitOutput>[];
  try {
    ({
      output: { units },
    } = await generate({ db, now }, userId, {
      model: models.roadmap,
      abortSignal: ctx.signal,
      instructions: roadmapInstructions,
      prompt:
        (await learnerSituation({ db }, userId)) +
        (previewed
          ? `\n\nThe Assessment Report already showed the Learner this first Unit. Make it Unit 1, keeping its title and objective: ${JSON.stringify(previewed)}`
          : ""),
      output: Output.object({ schema: roadmapOutput }),
    }));
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) return "failed" as const;
    throw e;
  }
  const at = now();
  await db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    if ((await tx.select({ id: unit.id }).from(unit).where(eq(unit.userId, userId)).limit(1)).length) return;
    await tx.insert(unit).values(
      units.map((u, position) => ({
        ...u,
        lessonOutline: positionedOutline(u.lessonOutline),
        userId,
        position,
        status: position ? ("planned" as const) : ("active" as const),
        createdAt: at,
      })),
    );
  });
  return "built" as const;
}

// Explicit skipping preserves every outline and completed Lesson.
export async function finishUnit(ctx: Ctx, id: string, status: "mastered" | "skipped") {
  const [owner] = await ctx.db.select({ userId: unit.userId }).from(unit).where(eq(unit.id, id));
  if (!owner) return;
  const changed = await ctx.db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, owner.userId)).for("update");
    const [before] = await tx.select().from(unit).where(eq(unit.id, id));
    if (!before || (before.status !== "active" && before.status !== "planned")) return false;
    await tx.update(unit).set({ status }).where(eq(unit.id, id));
    if (before.status !== "active") return false;
    await tx
      .update(lesson)
      .set({ status: "abandoned", preparationToken: null })
      .where(and(eq(lesson.unitId, id), eq(lesson.status, "in_progress")));
    const [next] = await tx
      .select()
      .from(unit)
      .where(and(eq(unit.userId, before.userId), eq(unit.status, "planned")))
      .orderBy(asc(unit.position))
      .limit(1);
    if (next) await tx.update(unit).set({ status: "active" }).where(eq(unit.id, next.id));
    return true;
  });
}

export const roadmap = (deps: Deps) =>
  new Hono<AppEnv>()
    // Upgrade existing Roadmaps without rewriting Units, completed Lessons or active practice.
    .post("/outline", async (c) => {
      const userId = c.var.user.id;
      const missing = (
        await deps.db
          .select()
          .from(unit)
          .where(and(eq(unit.userId, userId), sql`${unit.lessonOutline} = '[]'::jsonb`))
      )
        .filter((u) => u.status === "active" || u.status === "planned")
        .slice(0, 10);
      if (!missing.length) return c.json({ status: "ready" });
      const known = await deps.db
        .select({ unitId: lesson.unitId, title: lesson.title, kind: lesson.kind })
        .from(lesson)
        .where(eq(lesson.userId, userId));
      let plans: z.infer<typeof outlineOutput>;
      try {
        ({ output: plans } = await generate(deps, userId, {
          model: deps.models.roadmap,
          instructions: `${outlineInstructions} Return one entry per supplied Unit id. Plan future practice only; do not repeat known Lesson titles.`,
          prompt: JSON.stringify({
            learner: await learnerSituation(deps, userId),
            units: missing.map((u) => ({
              id: u.id,
              title: u.title,
              objective: u.objective,
              skills: u.skills,
              endsWithRoleplay: u.endsWithRoleplay,
              knownLessons: known.filter((l) => l.unitId === u.id),
            })),
          }),
          output: Output.object({ schema: outlineOutput }),
        }));
      } catch (e) {
        if (NoObjectGeneratedError.isInstance(e))
          return c.json({ error: "Your Lesson outlines couldn't be prepared. Try again." }, 502);
        throw e;
      }
      if (
        plans.units.length !== missing.length ||
        new Set(plans.units.map((u) => u.id)).size !== missing.length ||
        plans.units.some(
          (u) =>
            !missing.some((m) => m.id === u.id) ||
            !validOutline(u.lessonOutline, missing.find((m) => m.id === u.id)!.endsWithRoleplay),
        )
      )
        return c.json({ error: "Your Lesson outlines couldn't be prepared. Try again." }, 502);
      await deps.db.transaction(async (tx) => {
        for (const plan of plans.units) {
          const start = (
            await tx
              .select({ id: lesson.id })
              .from(lesson)
              .where(and(eq(lesson.unitId, plan.id), eq(lesson.kind, "practice")))
          ).length;
          await tx
            .update(unit)
            .set({ lessonOutline: positionedOutline(plan.lessonOutline, start) })
            .where(and(eq(unit.id, plan.id), eq(unit.userId, userId), sql`${unit.lessonOutline} = '[]'::jsonb`));
        }
      });
      return c.json({ status: "ready" });
    })
    // Every Unit in order, each with its Lessons (without their chat), so Home, the Roadmap and a Unit share one call.
    .get("/", async (c) => {
      const userId = c.var.user.id;
      const [units, lessons] = await Promise.all([
        deps.db.select().from(unit).where(eq(unit.userId, userId)).orderBy(asc(unit.position)),
        deps.db
          .select({
            unitId: lesson.unitId,
            id: lesson.id,
            position: lesson.position,
            kind: lesson.kind,
            title: lesson.title,
            status: lesson.status,
            preparation: lesson.preparation,
            contentVersion: lesson.contentVersion,
            startedAt: lesson.startedAt,
            objectiveProgress: lesson.objectiveProgress,
            // Every Quiz (and Practice Round) question answered: the Learner is choosing what's next.
            // The outer id is written out: Drizzle leaves single-table columns unqualified, which the subquery would read as step.id.
            quizDone: sql<boolean>`coalesce(jsonb_array_length(${lesson.quiz}), 0) > 0 and jsonb_array_length(${lesson.quiz}) <= (select count(*) from ${step} where ${step.lessonId} = "lesson"."id" and ${step.answeredAt} is not null)`,
          })
          .from(lesson)
          .where(and(eq(lesson.userId, userId), isNotNull(lesson.unitId)))
          .orderBy(asc(lesson.position)),
      ]);
      return c.json(
        units.map((u) => {
          const inUnit = lessons.filter((l) => l.unitId === u.id).map(({ unitId: _, ...l }) => l);
          return {
            ...u,
            roleplayReady: u.lessonOutline.length
              ? u.lessonOutline.find((p) => !inUnit.some((l) => l.position === p.position && l.status === "completed"))
                  ?.kind === "roleplay"
              : readyForRoleplay(u.endsWithRoleplay, inUnit),
            lessons: inUnit,
          };
        }),
      );
    })
    .post("/units/:id/skip", async (c) => {
      const [row] = await deps.db
        .select()
        .from(unit)
        .where(and(eq(unit.id, c.req.param("id")), eq(unit.userId, c.var.user.id)));
      if (!row) return c.json({ error: "Unit not found" }, 404);
      if (row.status !== "active" && row.status !== "planned")
        return c.json({ error: "This Unit is already finished" }, 409);
      await finishUnit(deps, row.id, "skipped");
      return c.json({ status: "skipped" });
    })
    .post("/", async (c) => {
      const result = await buildRoadmap(deps, c.var.user.id);
      if (result === "built") return c.json({ status: result }, 201);
      if (result === "failed") return c.json({ error: "The Roadmap couldn't be generated. Try again." }, 502);
      return c.json(
        {
          error:
            result === "exists" ? "The Roadmap already exists" : "Confirm your Goals and take the Assessment first",
        },
        409,
      );
    });
