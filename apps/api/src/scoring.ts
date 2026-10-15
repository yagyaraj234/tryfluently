import { schema, type CefrLevel, type Skill, type Tx as Db } from "@impromptu/db";
import { asc, desc, eq } from "drizzle-orm";

export const skills = ["fluency", "grammar", "vocabulary"] as const satisfies Skill[];

// Equal CEFR bands over 0–100: A1 0–16, A2 17–33, B1 34–50, B2 51–67, C1 68–84, C2 85–100.
export function cefr(score: number): CefrLevel {
  const bands = [16, 33, 50, 67, 84] as const;
  const levels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
  const i = bands.findIndex((top) => Math.round(score) <= top);
  return levels[i === -1 ? 5 : i]!;
}

export const scoreView = (score: number) => ({ score: Math.round(score), level: cefr(score) });

// Latest score per skill; skills never measured are missing.
async function latestScores(db: Db, userId: string) {
  const rows = await db
    .selectDistinctOn([schema.skillScore.skill], { skill: schema.skillScore.skill, score: schema.skillScore.score })
    .from(schema.skillScore)
    .where(eq(schema.skillScore.userId, userId))
    .orderBy(schema.skillScore.skill, desc(schema.skillScore.createdAt));
  return Object.fromEntries(rows.map((r) => [r.skill, r.score])) as Partial<Record<Skill, number>>;
}

export async function skillProfile(db: Db, userId: string) {
  const latest = await latestScores(db, userId);
  return Object.fromEntries(skills.map((s) => [s, latest[s] === undefined ? null : scoreView(latest[s])])) as Record<
    Skill,
    ReturnType<typeof scoreView> | null
  >;
}

export const skillHistory = (db: Db, userId: string) =>
  db
    .select({
      skill: schema.skillScore.skill,
      score: schema.skillScore.score,
      source: schema.skillScore.source,
      sourceId: schema.skillScore.sourceId,
      createdAt: schema.skillScore.createdAt,
    })
    .from(schema.skillScore)
    .where(eq(schema.skillScore.userId, userId))
    .orderBy(asc(schema.skillScore.createdAt), asc(schema.skillScore.skill));

// Appends one skill_score row per measured skill, moving each score toward the new result:
// new = old + α × (result − old). A skill's first measurement is taken as is.
export async function recordScores(
  db: Db,
  userId: string,
  results: Partial<Record<Skill, number>>,
  { alpha, source, sourceId, at }: { alpha: number; source: "assessment" | "lesson"; sourceId: string; at: Date },
) {
  const old = await latestScores(db, userId);

  const rows = (Object.entries(results) as [Skill, number][]).map(([skill, result]) => {
    const prev = old[skill];
    return {
      userId,
      skill,
      score: prev === undefined ? result : prev + alpha * (result - prev),
      source,
      sourceId,
      createdAt: at,
    };
  });
  if (rows.length) await db.insert(schema.skillScore).values(rows);
}
