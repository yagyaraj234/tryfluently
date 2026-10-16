import { schema, type CefrLevel, type Skill, type Tx as Db } from "@impromptu/db";
import type { UIMessage } from "ai";
import { asc, desc, eq } from "drizzle-orm";

export const skills = ["fluency", "grammar", "vocabulary"] as const satisfies Skill[];

export const cefrLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const satisfies CefrLevel[];

// Equal CEFR bands over 0–100: A1 0–16, A2 17–33, B1 34–50, B2 51–67, C1 68–84, C2 85–100.
export function cefr(score: number): CefrLevel {
  const bands = [16, 33, 50, 67, 84] as const;
  const i = bands.findIndex((top) => Math.round(score) <= top);
  return cefrLevels[i === -1 ? 5 : i]!;
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

// Every score change, oldest first, rounded and labelled with its CEFR Level like the Skill Profile.
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
    .orderBy(asc(schema.skillScore.createdAt), asc(schema.skillScore.skill))
    .then((rows) => rows.map((row) => ({ ...row, ...scoreView(row.score) })));

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

export type SpeechSegment = { words: number; startMs: number; endMs: number };

// The Learner's spoken stretches, from the timing kept on a Voice Assessment or Roleplay transcript.
export const speechSegments = (transcript: UIMessage[]): SpeechSegment[] =>
  transcript.flatMap((m) => {
    const t = m.metadata as { speechStartMs?: number; speechEndMs?: number } | undefined;
    if (m.role !== "user" || t?.speechStartMs === undefined || t.speechEndMs === undefined) return [];
    const words = m.parts.flatMap((p) => (p.type === "text" ? p.text.split(/\s+/).filter(Boolean) : [])).length;
    return [{ words, startMs: t.speechStartMs, endMs: t.speechEndMs }];
  });

// Fluency from voice timing plus the judge's view of coherence (0–100). Filler words aren't counted.
// ponytail: deliberately rough. Gaps under 3 s between the Learner's stretches count as hesitation (a coach reply
// takes longer); speed maps 60 wpm → 0 and 160 wpm → 100. Replace with word-level timing if it ever matters.
export function fluencyScore(segments: SpeechSegment[], coherence: number): number | null {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  const speechMs = sorted.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
  if (speechMs <= 0) return null;
  const pauseMs = sorted.slice(1).reduce((sum, s, i) => {
    const gap = s.startMs - sorted[i]!.endMs;
    return gap > 0 && gap < 3000 ? sum + gap : sum;
  }, 0);
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  const wpm = sorted.reduce((sum, s) => sum + s.words, 0) / (speechMs / 60_000);
  const pauses = 100 * (1 - pauseMs / (speechMs + pauseMs));
  return 0.4 * clamp(wpm - 60) + 0.2 * pauses + 0.4 * clamp(coherence);
}
