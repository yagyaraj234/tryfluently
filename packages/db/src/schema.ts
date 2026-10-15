import { boolean, jsonb, pgEnum, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

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
