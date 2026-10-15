import { schema } from "@impromptu/db";
import { NoObjectGeneratedError, Output } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate } from "./ai";
import type { AppEnv, Deps } from "./app";
import { skillProfile, skills } from "./scoring";

const { unit, goal, focusItem } = schema;

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

export const roadmap = (deps: Deps) =>
  new Hono<AppEnv>()
    .get("/", async (c) => c.json(await deps.db.select().from(unit).where(eq(unit.userId, c.var.user.id)).orderBy(asc(unit.position))))
    .post("/", async (c) => {
      const result = await buildRoadmap(deps, c.var.user.id);
      if (result === "built") return c.json({ status: result }, 201);
      if (result === "failed") return c.json({ error: "The Roadmap couldn't be generated. Try again." }, 502);
      return c.json(
        { error: result === "exists" ? "The Roadmap already exists" : "Confirm your Goals and take the Assessment first" },
        409,
      );
    });
