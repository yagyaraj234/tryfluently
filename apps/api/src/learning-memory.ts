import { schema, type Tx } from "@fluently/db";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function countFocusHits(tx: Tx, userId: string, ids: string[], at: Date) {
  if (!ids.length) return;
  const { focusItem } = schema;
  const closes = sql`${focusItem.hits} + 1 >= 3`;
  await tx
    .update(focusItem)
    .set({
      hits: sql`${focusItem.hits} + 1`,
      status: sql`case when ${closes} then 'closed'::focus_status else 'open'::focus_status end`,
      closedAt: sql`case when ${closes} then ${at.toISOString()}::timestamp end`,
    })
    .where(and(eq(focusItem.userId, userId), eq(focusItem.status, "open"), inArray(focusItem.id, [...new Set(ids)])));
}

// Caller holds the Learner lock, so concurrent completions share the same open practice target.
export async function addFocusItems(tx: Tx, userId: string, items: (typeof schema.focusItem.$inferInsert)[]) {
  const open = await tx
    .select()
    .from(schema.focusItem)
    .where(and(eq(schema.focusItem.userId, userId), eq(schema.focusItem.status, "open")));
  const key = (item: { kind: string; label: string }) =>
    `${item.kind}:${item.label.trim().replace(/\s+/g, " ").toLowerCase()}`;
  const seen = new Set(open.map(key));
  const fresh = items.filter((item) => {
    const id = key(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (fresh.length) await tx.insert(schema.focusItem).values(fresh);
}

// Caller holds the Learner lock. Keep recent evidence, never raw Goal Context or full transcripts.
export async function remember(tx: Tx, userId: string, evidence: string, at: Date) {
  const [previous] = await tx.select().from(schema.learnerMemory).where(eq(schema.learnerMemory.userId, userId));
  const summary = [previous?.summary, evidence.replace(/\s+/g, " ").slice(0, 1500)]
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .slice(-8)
    .join("\n");
  await tx
    .insert(schema.learnerMemory)
    .values({ userId, summary, updatedAt: at })
    .onConflictDoUpdate({ target: schema.learnerMemory.userId, set: { summary, updatedAt: at } });
}

export async function advanceUnit(tx: Tx, unitId: string) {
  const [u] = await tx.select().from(schema.unit).where(eq(schema.unit.id, unitId));
  if (!u || u.status !== "active" || !u.lessonOutline.length) return;
  const lessons = await tx.select().from(schema.lesson).where(eq(schema.lesson.unitId, unitId));
  if (
    !u.lessonOutline.every((p) =>
      lessons.some((l) => l.position === p.position && (l.status === "completed" || l.status === "skipped")),
    )
  )
    return;
  await tx.update(schema.unit).set({ status: "mastered" }).where(eq(schema.unit.id, unitId));
  const next = (await tx.select().from(schema.unit).where(eq(schema.unit.userId, u.userId)))
    .filter((v) => v.status === "planned")
    .sort((a, b) => a.position - b.position)[0];
  if (next) await tx.update(schema.unit).set({ status: "active" }).where(eq(schema.unit.id, next.id));
}
