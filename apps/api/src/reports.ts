import { schema } from "@fluently/db";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "./app";

export const reports = ({ db }: Pick<Deps, "db">) =>
  new Hono<AppEnv>().get("/", async (c) => {
    const userId = c.var.user.id;
    const [assessments, lessons] = await Promise.all([
      db
        .select({ id: schema.assessment.id, at: schema.assessment.endedAt, mode: schema.assessment.mode })
        .from(schema.assessment)
        .where(and(eq(schema.assessment.userId, userId), eq(schema.assessment.status, "completed"))),
      db
        .select({
          id: schema.lesson.id,
          at: schema.lesson.completedAt,
          title: schema.lesson.title,
          kind: schema.lesson.kind,
        })
        .from(schema.lesson)
        .where(and(eq(schema.lesson.userId, userId), eq(schema.lesson.status, "completed"))),
    ]);
    return c.json(
      [
        ...assessments.map((a) => ({
          id: a.id,
          at: a.at,
          title: `${a.mode === "voice" ? "Voice" : "Written"} Assessment`,
          kind: "assessment" as const,
        })),
        ...lessons.map((l) => ({
          id: l.id,
          at: l.at,
          title: l.title,
          kind: l.kind === "roleplay" ? ("roleplay" as const) : ("lesson" as const),
        })),
      ].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) || b.id.localeCompare(a.id)),
    );
  });
