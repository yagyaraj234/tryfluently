import { boolean, integer, jsonb, pgEnum, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

// Better Auth's tables. Every later table must reference user.id with onDelete: "cascade".
export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  timezone: text().notNull().default("UTC"),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text().primaryKey(),
  expiresAt: timestamp().notNull(),
  token: text().notNull().unique(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text().primaryKey(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp(),
  refreshTokenExpiresAt: timestamp(),
  scope: text(),
  password: text(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp().notNull().defaultNow(),
});

const id = () => text().primaryKey().$defaultFn(() => crypto.randomUUID());
const learner = () => text().notNull().references(() => user.id, { onDelete: "cascade" });

export type Skill = "fluency" | "grammar" | "vocabulary";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const goalKind = pgEnum("goal_kind", ["job_interview", "client_communication", "general_fluency"]);
export const goalStatus = pgEnum("goal_status", ["proposed", "confirmed"]);

export const goal = pgTable("goal", {
  id: id(),
  userId: learner(),
  kind: goalKind().notNull(),
  // Raw Goal Context, kept only so the Brief can be regenerated. Prompts use `brief`.
  contextRaw: text(),
  brief: text(),
  targetLevels: jsonb().$type<Partial<Record<Skill, CefrLevel>>>().notNull().default({}),
  status: goalStatus().notNull().default("proposed"),
  createdAt: timestamp().notNull().defaultNow(),
});

export const usageKind = pgEnum("usage_kind", ["realtime", "recording", "text"]);

export const aiUsage = pgTable("ai_usage", {
  id: id(),
  userId: learner(),
  kind: usageKind().notNull(),
  callId: text(),
  startedAt: timestamp().notNull(),
  seconds: real().notNull().default(0),
  usage: jsonb().$type<Record<string, unknown>>(),
});

export const assessmentMode = pgEnum("assessment_mode", ["voice", "written"]);
export const assessmentStatus = pgEnum("assessment_status", ["in_progress", "completed", "discarded"]);

export const assessment = pgTable("assessment", {
  id: id(),
  userId: learner(),
  mode: assessmentMode().notNull(),
  status: assessmentStatus().notNull().default("in_progress"),
  startedAt: timestamp().notNull(),
  endedAt: timestamp(),
  // UI messages of the conversation; checked against zod in the API.
  transcript: jsonb().$type<unknown[]>().notNull().default([]),
  report: jsonb().$type<Record<string, unknown>>(),
  emailedAt: timestamp(),
});

export const skill = pgEnum("skill", ["fluency", "grammar", "vocabulary"]);
export const scoreSource = pgEnum("score_source", ["assessment", "lesson"]);

// Append-only. The Skill Profile is the latest row per skill.
export const skillScore = pgTable("skill_score", {
  id: id(),
  userId: learner(),
  skill: skill().notNull(),
  score: real().notNull(),
  source: scoreSource().notNull(),
  sourceId: text().notNull(),
  createdAt: timestamp().notNull(),
});

export const focusKind = pgEnum("focus_kind", ["grammar", "vocabulary", "phrase"]);
export const focusSource = pgEnum("focus_source", ["assessment", "debrief", "lesson"]);
export const focusStatus = pgEnum("focus_status", ["open", "closed"]);

export const focusItem = pgTable("focus_item", {
  id: id(),
  userId: learner(),
  label: text().notNull(),
  kind: focusKind().notNull(),
  source: focusSource().notNull(),
  sourceId: text().notNull(),
  hits: integer().notNull().default(0),
  status: focusStatus().notNull().default("open"),
  createdAt: timestamp().notNull(),
  closedAt: timestamp(),
});

export const unitStatus = pgEnum("unit_status", ["planned", "active", "mastered", "skipped"]);

// The Roadmap is a Learner's Units ordered by position; there's no roadmap table.
export const unit = pgTable("unit", {
  id: id(),
  userId: learner(),
  position: integer().notNull(),
  title: text().notNull(),
  objective: text().notNull(),
  skills: jsonb().$type<Skill[]>().notNull(),
  endsWithRoleplay: boolean().notNull().default(false),
  status: unitStatus().notNull().default("planned"),
  createdAt: timestamp().notNull(),
});

export const lessonKind = pgEnum("lesson_kind", ["practice", "roleplay"]);
export const lessonStatus = pgEnum("lesson_status", ["in_progress", "completed", "abandoned"]);
export const roleplayKind = pgEnum("roleplay_kind", ["mock_interview", "client_call"]);
export const tone = pgEnum("tone", ["friendly", "standard", "tough"]);

export const lesson = pgTable("lesson", {
  id: id(),
  userId: learner(),
  unitId: text().references(() => unit.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  kind: lessonKind().notNull(),
  title: text().notNull(),
  objective: text().notNull(),
  roleplayKind: roleplayKind(),
  tone: tone(),
  status: lessonStatus().notNull().default("in_progress"),
  objectiveProgress: integer(),
  summary: text(),
  textMode: boolean().notNull().default(false),
  // UI messages of the Lesson chat, so it can resume; checked against the tool schemas in the API.
  messages: jsonb().$type<unknown[]>().notNull().default([]),
  debrief: jsonb().$type<Record<string, unknown>>(),
  startedAt: timestamp().notNull(),
  completedAt: timestamp(),
});

export const stepType = pgEnum("step_type", ["vocabCard", "fillGap", "rewrite", "speakPrompt", "roleplayTurn"]);
export const stepMode = pgEnum("step_mode", ["voice", "text"]);

export const step = pgTable("step", {
  id: id(),
  userId: learner(),
  lessonId: text()
    .notNull()
    .references(() => lesson.id, { onDelete: "cascade" }),
  position: integer().notNull(),
  type: stepType().notNull(),
  mode: stepMode().notNull().default("text"),
  input: jsonb().$type<Record<string, unknown>>().notNull(),
  output: jsonb().$type<Record<string, unknown>>(),
  feedback: jsonb().$type<{ verdict: "correct" | "almost" | "incorrect"; corrected: string; explanation: string }>(),
  timing: jsonb().$type<Record<string, unknown>>(),
  answeredAt: timestamp(),
});
