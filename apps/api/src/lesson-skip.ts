import { schema, type Tx } from "@fluently/db";
import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { requirePro } from "./billing-credits";
import { advanceUnit } from "./learning-memory";

export async function skipLesson(db: Tx, userId: string, position: number, at: Date) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    await requirePro(tx, userId, at);
    const [unit] = await tx
      .select()
      .from(schema.unit)
      .where(and(eq(schema.unit.userId, userId), eq(schema.unit.status, "active")));
    const rows = unit
      ? await tx
          .select()
          .from(schema.lesson)
          .where(eq(schema.lesson.unitId, unit.id))
          .orderBy(asc(schema.lesson.position))
      : [];
    const next = unit?.lessonOutline.find(
      (p) => !rows.some((l) => l.position === p.position && (l.status === "completed" || l.status === "skipped")),
    );
    if (!unit || !next || next.position !== position)
      throw new HTTPException(409, { message: "Only your current or next Lesson can be skipped." });
    const existing = rows.find((l) => l.position === position);
    if (existing)
      await tx
        .update(schema.lesson)
        .set({ status: "skipped", preparationToken: null, completedAt: null })
        .where(eq(schema.lesson.id, existing.id));
    else
      await tx.insert(schema.lesson).values({
        userId,
        unitId: unit.id,
        position,
        kind: next.kind,
        title: next.title,
        objective: next.objective,
        status: "skipped",
        contentVersion: 3,
      });
    await advanceUnit(tx, unit.id);
    return { status: "skipped" as const, lessonId: existing?.id };
  });
}
