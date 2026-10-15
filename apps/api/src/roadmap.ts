import { schema } from "@impromptu/db";
import { NoObjectGeneratedError, Output } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate } from "./ai";
import type { AppEnv, Deps } from "./app";
import { skillProfile, skills } from "./scoring";

const { unit, goal, focusItem, lesson } = schema;

export const unitOutput = z.object({
  title: z.string(),
  objective: z.string(),
  skills: z.array(z.enum(skills)).min(1),
  endsWithRoleplay: z.boolean(),
});
const roadmapOutput = z.object({ units: z.array(unitOutput).min(8).max(10) });

const roadmapInstructions = `You plan an English coaching Roadmap. Write 8–10 Units in order, each a focused topic with
a concrete objective the Learner can meet, the skills it practises (fluency, grammar, vocabulary), and whether it ends
with a Roleplay (a Mock Interview for a Job Interview Goal, a Client Call for a Client Communication Goal).
Start from the Learner's weaknesses and work toward their Target Levels.`;

type Ctx = Pick<Deps, "db" | "now" | "models">;

// What the roadmap model sees: Goals (through their Briefs), the Skill Profile and open Focus Items.
export async function learnerSituation({ db }: Pick<Deps, "db">, userId: string) {
  const [goals, profile, focus] = await Promise.all([
    db
      .select({ kind: goal.kind, targetLevels: goal.targetLevels, brief: goal.brief })
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
export async function buildRoadmap({ db, now, models }: Ctx, userId: string) {
  const [existing] = await db.select({ id: unit.id }).from(unit).where(eq(unit.userId, userId)).limit(1);
  if (existing) return "exists" as const;
  const statuses = new Set((await db.select({ status: goal.status }).from(goal).where(eq(goal.userId, userId))).map((g) => g.status));
  const profile = await skillProfile(db, userId);
  if (!statuses.has("confirmed") || statuses.has("proposed") || Object.values(profile).every((s) => s === null))
    return "not_ready" as const;

  let units: z.infer<typeof unitOutput>[];
  try {
    ({ output: { units } } = await generate({ db, now }, userId, {
      model: models.roadmap,
      instructions: roadmapInstructions,
      prompt: await learnerSituation({ db }, userId),
      output: Output.object({ schema: roadmapOutput }),
    }));
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) return "failed" as const;
    throw e;
  }
  const at = now();
  await db
    .insert(unit)
    .values(units.map((u, position) => ({ ...u, userId, position, status: position ? "planned" as const : "active" as const, createdAt: at })));
  return "built" as const;
}

const MASTERY_PROGRESS = 80;
const MAX_LESSONS = 15;

// The one place a Unit finishes. Finishing the active Unit abandons its open Lesson and activates the next planned one.
// ponytail: a Unit that hits the 15-Lesson cap is marked skipped, since the spec's statuses have no "ended".
export async function finishUnit({ db }: Pick<Deps, "db">, id: string, status: "mastered" | "skipped") {
  const [before] = await db.select().from(unit).where(eq(unit.id, id));
  await db.update(unit).set({ status }).where(eq(unit.id, id));
  if (before?.status !== "active") return;
  await db
    .update(lesson)
    .set({ status: "abandoned" })
    .where(and(eq(lesson.unitId, id), eq(lesson.status, "in_progress")));
  const [next] = await db
    .select({ id: unit.id })
    .from(unit)
    .where(and(eq(unit.userId, before.userId), eq(unit.status, "planned")))
    .orderBy(asc(unit.position))
    .limit(1);
  if (next) await db.update(unit).set({ status: "active" }).where(eq(unit.id, next.id));
}

// After each completed Lesson: mastered at 80+ in two Lessons in a row, ended after 15 Lessons.
export async function progressUnit(deps: Pick<Deps, "db">, id: string) {
  const done = await deps.db
    .select({ progress: lesson.objectiveProgress })
    .from(lesson)
    .where(and(eq(lesson.unitId, id), eq(lesson.status, "completed")))
    .orderBy(asc(lesson.position));
  const lastTwo = done.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((l) => (l.progress ?? 0) >= MASTERY_PROGRESS)) return finishUnit(deps, id, "mastered");
  if (done.length >= MAX_LESSONS) return finishUnit(deps, id, "skipped");
}

export const roadmap = (deps: Deps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => c.json(await deps.db.select().from(unit).where(eq(unit.userId, c.var.user.id)).orderBy(asc(unit.position))))
    .post("/units/:id/skip", async (c) => {
      const [row] = await deps.db
        .select()
        .from(unit)
        .where(and(eq(unit.id, c.req.param("id")), eq(unit.userId, c.var.user.id)));
      if (!row) return c.json({ error: "Unit not found" }, 404);
      if (row.status !== "active" && row.status !== "planned") return c.json({ error: "This Unit is already finished" }, 409);
      await finishUnit(deps, row.id, "skipped");
      return c.json({ status: "skipped" });
    })
    .post("/", async (c) => {
      const result = await buildRoadmap(deps, c.var.user.id);
      if (result === "built") return c.json({ status: result }, 201);
      if (result === "failed") return c.json({ error: "The Roadmap couldn't be generated. Try again." }, 502);
      return c.json(
        { error: result === "exists" ? "The Roadmap already exists" : "Confirm your Goals and take the Assessment first" },
        409,
      );
    });
