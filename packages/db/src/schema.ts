import {
  boolean,
  bigserial,
  customType,
  doublePrecision,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Uint8Array }>({ dataType: () => "bytea" });

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

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp().notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp(),
    refreshTokenExpiresAt: timestamp(),
    scope: text(),
    password: text(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const learner = () =>
  text()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export type Skill = "fluency" | "grammar" | "vocabulary";
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const goalKind = pgEnum("goal_kind", ["job_interview", "client_communication", "general_fluency"]);
export const goalStatus = pgEnum("goal_status", ["proposed", "confirmed"]);

export const goal = pgTable(
  "goal",
  {
    id: id(),
    userId: learner(),
    kind: goalKind().notNull(),
    // The Learner's Goal in their own words. Kind stays as an internal category for Roleplay defaults.
    statement: text(),
    // Raw Goal Context, kept only so the Brief can be regenerated. Prompts use `brief`.
    contextRaw: text(),
    brief: text(),
    targetLevels: jsonb().$type<Partial<Record<Skill, CefrLevel>>>().notNull().default({}),
    status: goalStatus().notNull().default("proposed"),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("goal_user_idx").on(t.userId)],
);

export const usageKind = pgEnum("usage_kind", ["realtime", "recording", "text"]);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: learner(),
    kind: usageKind().notNull(),
    callId: text(),
    startedAt: timestamp().notNull(),
    seconds: real().notNull().default(0),
    usage: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [index("ai_usage_user_kind_started_idx").on(t.userId, t.kind, t.startedAt)],
);

export const assessmentMode = pgEnum("assessment_mode", ["voice", "written"]);
export const assessmentStatus = pgEnum("assessment_status", ["in_progress", "completed", "discarded"]);

export const assessment = pgTable(
  "assessment",
  {
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
  },
  (t) => [
    uniqueIndex("assessment_one_open_per_user_idx")
      .on(t.userId)
      .where(sql`${t.status} = 'in_progress'`),
    index("assessment_user_status_ended_idx").on(t.userId, t.status, t.endedAt),
  ],
);

// Durable background work: follow-ups committed with an Assessment's Report, and Lesson generation.
// Assessment jobs set assessmentId; `lesson` jobs set lessonId.
export const assessmentJob = pgTable(
  "assessment_job",
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    assessmentId: text().references(() => assessment.id, { onDelete: "cascade" }),
    lessonId: text().references(() => lesson.id, { onDelete: "cascade" }),
    userId: learner(),
    kind: text().$type<"report_email" | "practice" | "lesson" | "lesson_analysis">().notNull(),
    status: text().$type<"pending" | "running" | "done" | "failed">().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    availableAt: timestamp().notNull().defaultNow(),
    lockedAt: timestamp(),
    token: text(),
  },
  (t) => [
    uniqueIndex("assessment_job_assessment_kind_idx").on(t.assessmentId, t.kind),
    uniqueIndex("assessment_job_lesson_kind_idx").on(t.lessonId, t.kind),
    index("assessment_job_status_available_idx").on(t.status, t.availableAt),
    index("assessment_job_user_kind_status_idx").on(t.userId, t.kind, t.status),
  ],
);

export const skill = pgEnum("skill", ["fluency", "grammar", "vocabulary"]);
export const scoreSource = pgEnum("score_source", ["assessment", "lesson"]);

// One row per measurement, in write order. Late feedback can revise a measurement and its later averages.
export const skillScore = pgTable(
  "skill_score",
  {
    id: id(),
    sequence: bigserial({ mode: "bigint" }).notNull(),
    userId: learner(),
    skill: skill().notNull(),
    score: real().notNull(),
    result: doublePrecision(),
    alpha: doublePrecision(),
    source: scoreSource().notNull(),
    sourceId: text().notNull(),
    createdAt: timestamp().notNull(),
  },
  (t) => [index("skill_score_user_skill_sequence_idx").on(t.userId, t.skill, t.sequence)],
);

export const focusKind = pgEnum("focus_kind", ["grammar", "vocabulary", "phrase"]);
export const focusSource = pgEnum("focus_source", ["assessment", "debrief", "lesson"]);
export const focusStatus = pgEnum("focus_status", ["open", "closed"]);

export const focusItem = pgTable(
  "focus_item",
  {
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
  },
  (t) => [index("focus_item_user_status_idx").on(t.userId, t.status)],
);

export const unitStatus = pgEnum("unit_status", ["planned", "active", "mastered", "skipped"]);

// The Roadmap is a Learner's Units ordered by position; there's no roadmap table.
export const unit = pgTable(
  "unit",
  {
    id: id(),
    userId: learner(),
    position: integer().notNull(),
    title: text().notNull(),
    objective: text().notNull(),
    skills: jsonb().$type<Skill[]>().notNull(),
    lessonOutline: jsonb()
      .$type<
        {
          title: string;
          objective: string;
          skill: Skill;
          kind: "practice" | "roleplay";
          position: number;
          estimatedMinutes?: number;
          pageCount?: number;
        }[]
      >()
      .notNull()
      .default([]),
    endsWithRoleplay: boolean().notNull().default(false),
    status: unitStatus().notNull().default("planned"),
    createdAt: timestamp().notNull(),
  },
  (t) => [index("unit_user_position_idx").on(t.userId, t.position)],
);

export const lessonKind = pgEnum("lesson_kind", ["practice", "roleplay"]);
export const lessonStatus = pgEnum("lesson_status", ["in_progress", "completed", "abandoned"]);
export const roleplayKind = pgEnum("roleplay_kind", [
  "mock_interview",
  "client_call",
  "presentation",
  "team_meeting",
  "phone_call",
  "small_talk",
  "custom",
]);
export const tone = pgEnum("tone", ["friendly", "standard", "tough"]);

export const lesson = pgTable(
  "lesson",
  {
    id: id(),
    userId: learner(),
    unitId: text().references(() => unit.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    kind: lessonKind().notNull(),
    title: text().notNull(),
    objective: text().notNull(),
    roleplayKind: roleplayKind(),
    // The Learner's own situation for a custom Roleplay.
    roleplayScenario: text(),
    tone: tone(),
    status: lessonStatus().notNull().default("in_progress"),
    objectiveProgress: integer(),
    summary: text(),
    textMode: boolean().notNull().default(false),
    // UI messages of the Lesson chat, so it can resume; checked against the tool schemas in the API.
    messages: jsonb().$type<unknown[]>().notNull().default([]),
    debrief: jsonb().$type<Record<string, unknown>>(),
    preparation: text().$type<"preparing" | "ready" | "failed">(),
    preparationToken: text(),
    preparationAt: timestamp(),
    material: jsonb().$type<{ title: string; body: string; example: string | null }[]>(),
    phase: text().$type<"learning" | "assessment">(),
    report: jsonb().$type<Record<string, unknown>>(),
    // 1 = Lessons prepared before paged Lessons (material + Steps). 2 = Pages generated when the Learner presses Start.
    contentVersion: integer().notNull().default(1),
    currentPage: integer().notNull().default(0),
    // Paged Lessons only: status of each Page and of its question slot, in Page order.
    pageStatus: jsonb().$type<{ page: "pending" | "ready" | "failed"; question: "pending" | "ready" | "failed" }[]>(),
    startedAt: timestamp(),
    completedAt: timestamp(),
  },
  (t) => [index("lesson_user_idx").on(t.userId), index("lesson_unit_position_idx").on(t.unitId, t.position)],
);

export const stepType = pgEnum("step_type", [
  "vocabCard",
  "fillGap",
  "rewrite",
  "speakPrompt",
  "roleplayTurn",
  "fillGaps",
  "reorder",
  "multipleChoice",
  "matchPairs",
]);
export const stepMode = pgEnum("step_mode", ["voice", "text"]);

export const step = pgTable(
  "step",
  {
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
  },
  (t) => [
    index("step_lesson_position_idx").on(t.lessonId, t.position),
    index("step_user_answered_idx").on(t.userId, t.answeredAt),
  ],
);

// Reference Pronunciation clips, shared by all Learners and cached by text and voice,
// since Kenpath's free tier allows only 2 concurrent streams.
export const pronunciationClip = pgTable(
  "pronunciation_clip",
  {
    text: text().notNull(),
    voice: text().notNull(),
    audio: bytea().notNull(),
    contentType: text().notNull(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.text, t.voice] })],
);

export const learnerMemory = pgTable("learner_memory", {
  userId: learner().primaryKey(),
  summary: text().notNull(),
  updatedAt: timestamp().notNull(),
});
