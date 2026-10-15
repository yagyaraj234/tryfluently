import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate } from "./ai";
import type { AppEnv, Deps } from "./app";
import { buildRoadmap } from "./roadmap";

export const cefrLevel = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export const targetLevels = z.object({ fluency: cefrLevel, grammar: cefrLevel, vocabulary: cefrLevel }).partial();
export const goalKind = z.enum(["job_interview", "client_communication", "general_fluency"]);
const goalContext = z.string().max(20_000, "Goal Context must be at most 20,000 characters");

const { goal } = schema;

// The raw Goal Context never leaves the server once it's in; responses carry the Brief instead.
const view = ({ contextRaw, userId, ...g }: typeof goal.$inferSelect) => ({ ...g, hasContext: contextRaw !== null });

const briefInstructions = `You write a Learner Brief for an English coach.
Summarise the Learner's Goal Context in about 300 words: their role, seniority, field, the situation they are preparing for
and anything an interviewer or client would ask about. Plain prose, no headings. Leave out contact details.`;

export const goals = (deps: Deps) => {
  const { db, now, models } = deps;
  const roadmapFailed = async (userId: string) => (await buildRoadmap(deps, userId)) === "failed";
  return (
  new Hono<AppEnv>()
    .get("/", async (c) => {
      const rows = await db.select().from(goal).where(eq(goal.userId, c.var.user.id)).orderBy(asc(goal.createdAt));
      return c.json(rows.map(view));
    })
    .post(
      "/",
      zValidator("json", z.object({ kind: goalKind, context: goalContext.optional(), targetLevels: targetLevels.optional() })),
      async (c) => {
        const { kind, context, targetLevels } = c.req.valid("json");
        const [row] = await db
          .insert(goal)
          .values({ userId: c.var.user.id, kind, contextRaw: context, targetLevels, createdAt: now() })
          .returning();
        return c.json(view(row!), 201);
      },
    )
    // The Learner can edit a Goal as they confirm it, e.g. a proposed one's kind or Target Levels.
    .post(
      "/:id/confirm",
      zValidator("json", z.object({ kind: goalKind, context: goalContext, targetLevels }).partial()),
      async (c) => {
        const userId = c.var.user.id;
        const mine = and(eq(goal.id, c.req.param("id")), eq(goal.userId, userId));
        const [row] = await db.select().from(goal).where(mine);
        if (!row) return c.json({ error: "Goal not found" }, 404);

        const edits = c.req.valid("json");
        const context = edits.context ?? row.contextRaw;
        const brief = context
          ? (await generate({ db, now }, userId, { model: models.brief, instructions: briefInstructions, prompt: context })).text
          : null;
        const [updated] = await db
          .update(goal)
          .set({ kind: edits.kind, targetLevels: edits.targetLevels, contextRaw: context, status: "confirmed", brief })
          .where(mine)
          .returning();
        if (await roadmapFailed(userId))
          return c.json({ error: "The Roadmap couldn't be generated. Try again.", goal: view(updated!) }, 502);
        return c.json(view(updated!));
      },
    )
    .delete("/:id", async (c) => {
      const deleted = await db
        .delete(goal)
        .where(and(eq(goal.id, c.req.param("id")), eq(goal.userId, c.var.user.id)))
        .returning({ id: goal.id });
      if (!deleted.length) return c.json({ error: "Goal not found" }, 404);
      // Turning down the last proposed Goal can complete the set the Roadmap waits for.
      await roadmapFailed(c.var.user.id);
      return c.body(null, 204);
    })
  );
};
