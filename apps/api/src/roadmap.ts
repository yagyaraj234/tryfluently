import { schema } from "@impromptu/db";
import { NoObjectGeneratedError, Output } from "ai";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate } from "./ai";
import type { AppEnv, Deps } from "./app";
import { cefrLevels, skillProfile, skills } from "./scoring";

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

const revisionOutput = z.object({ units: z.array(unitOutput).min(1).max(10) });

const revisionInstructions = (task: string) => `You revise a Learner's English coaching Roadmap. Mastered, skipped and
active Units are fixed. ${task} Each Unit is a focused topic with a concrete objective, the skills it practises
(fluency, grammar, vocabulary), and whether it ends with a Roleplay.`;

const rewriteTask = `Rewrite the planned Units still to come (1–10 of them) to fit the Learner's current Skill Profile,
open Focus Items and Target Levels, without repeating finished Units.`;
const extendTask = `Every Unit is finished but some skills are still below their Target Levels. Write 3–5 more Units that close the gap.`;

// Is any skill below the highest Target Level a confirmed Goal sets for it? An unmeasured skill counts as below.
async function belowTarget(db: Deps["db"], userId: string) {
  const [goals, profile] = await Promise.all([
    db.select({ targetLevels: goal.targetLevels }).from(goal).where(and(eq(goal.userId, userId), eq(goal.status, "confirmed"))),
    skillProfile(db, userId),
  ]);
  return goals.some((g) =>
    Object.entries(g.targetLevels).some(([skill, target]) => {
      const level = profile[skill as keyof typeof profile]?.level;
      return !level || cefrLevels.indexOf(level) < cefrLevels.indexOf(target);
    }),
  );
}

// Rewrites only the planned Units; with none left open and a skill below target, adds more.
// A failed revision is logged and the old planned Units stay.
export async function reviseRoadmap({ db, now, models }: Ctx, userId: string) {
  const units = await db.select().from(unit).where(eq(unit.userId, userId)).orderBy(asc(unit.position));
  const planned = units.filter((u) => u.status === "planned");
  const hasActive = units.some((u) => u.status === "active");
  if (!units.length || (!planned.length && (hasActive || !(await belowTarget(db, userId))))) return;

  const roadmapSoFar = units.map(({ title, objective, skills, status }) => ({ title, objective, skills, status }));
  let revised: z.infer<typeof unitOutput>[];
  try {
    ({ output: { units: revised } } = await generate({ db, now }, userId, {
      model: models.roadmap,
      instructions: revisionInstructions(planned.length ? rewriteTask : extendTask),
      prompt: `${await learnerSituation({ db }, userId)}\n\nRoadmap so far:\n${JSON.stringify(roadmapSoFar, null, 2)}`,
      output: Output.object({ schema: revisionOutput }),
    }));
  } catch (e) {
    if (!NoObjectGeneratedError.isInstance(e)) throw e;
    console.error("roadmap revision failed", e);
    return;
  }

  const start = Math.max(-1, ...units.filter((u) => u.status !== "planned").map((u) => u.position)) + 1;
  const at = now();
  await db.transaction(async (tx) => {
    await tx.delete(unit).where(and(eq(unit.userId, userId), eq(unit.status, "planned")));
    await tx.insert(unit).values(
      revised.map((u, i) => ({
        ...u,
        userId,
        position: start + i,
        status: i === 0 && !hasActive ? ("active" as const) : ("planned" as const),
        createdAt: at,
      })),
    );
  });
}

const MASTERY_PROGRESS = 80;
const MAX_LESSONS = 15;

// The one place a Unit finishes. Finishing the active Unit abandons its open Lesson, activates the next planned one
// and revises the Roadmap.
// ponytail: a Unit that hits the 15-Lesson cap is marked skipped, since the spec's statuses have no "ended".
export async function finishUnit(ctx: Ctx, id: string, status: "mastered" | "skipped") {
  const { db } = ctx;
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
  await reviseRoadmap(ctx, before.userId);
}

// After each completed Lesson: mastered at 80+ in two Lessons in a row, ended after 15 Lessons.
export async function progressUnit(deps: Ctx, id: string) {
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
            objectiveProgress: lesson.objectiveProgress,
          })
          .from(lesson)
          .where(and(eq(lesson.userId, userId), isNotNull(lesson.unitId)))
          .orderBy(asc(lesson.position)),
      ]);
      return c.json(units.map((u) => ({ ...u, lessons: lessons.filter((l) => l.unitId === u.id).map(({ unitId: _, ...l }) => l) })));
    })
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
