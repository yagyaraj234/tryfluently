import { schema, type Tx } from "@fluently/db";
import { zValidator } from "@hono/zod-validator";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { learnerMessage } from "./steps";
import { streamChat, unchanged } from "./ai";
import type { AppEnv, Deps } from "./app";
import { completeLesson } from "./completion";
import { goalText } from "./goal-text";
import { endCallTool, voiceLimitMessage, type RealtimeBroker } from "./realtime";

const { lesson, goal } = schema;

export const roleplayKinds = [
  "mock_interview",
  "client_call",
  "presentation",
  "team_meeting",
  "phone_call",
  "small_talk",
  "custom",
] as const;
export type RoleplayKind = (typeof roleplayKinds)[number];
const roleplayKind = z.enum(roleplayKinds);
const roleplayScenario = z
  .string()
  .trim()
  .min(3, "Describe the Roleplay in at least 3 characters")
  .max(500, "Your Roleplay description must be at most 500 characters");
type Tone = "friendly" | "standard" | "tough";
type Ctx = { db: Tx; now: Deps["now"] };

// Learner-facing names. "Interview" only ever appears as "Mock Interview".
const titles: Record<RoleplayKind, string> = {
  mock_interview: "Mock Interview",
  client_call: "Client Call",
  presentation: "Presentation",
  team_meeting: "Team Meeting",
  phone_call: "Phone Call",
  small_talk: "Small Talk",
  custom: "Custom Roleplay",
};
const objectives: Record<RoleplayKind, string> = {
  mock_interview: "Answer Mock Interview questions in clear, natural English",
  client_call: "Handle a Client Call in clear, natural English",
  presentation: "Give a Presentation in clear, natural English",
  team_meeting: "Take part in a Team Meeting in clear, natural English",
  phone_call: "Handle a Phone Call in clear, natural English",
  small_talk: "Make Small Talk in clear, natural English",
  custom: "Handle the situation you described in clear, natural English",
};

const confirmedGoalTexts = async ({ db }: Pick<Deps, "db">, userId: string) =>
  (
    await db
      .select({ statement: goal.statement, brief: goal.brief })
      .from(goal)
      .where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")))
  ).flatMap((g) => {
    const text = goalText(g);
    return text ? [text] : [];
  });

// Creates a Roleplay Lesson; `unitId` is set when it closes a Unit, null when started from a Goal.
export async function createRoleplay(
  { db, now }: Ctx,
  userId: string,
  {
    kind,
    tone = "standard",
    unitId = null,
    position = 0,
    textMode = false,
    plan,
    scenario = null,
  }: {
    plan?: { title: string; objective: string };
    kind: RoleplayKind;
    tone?: Tone;
    unitId?: string | null;
    position?: number;
    textMode?: boolean;
    scenario?: string | null;
  },
) {
  const [row] = await db
    .insert(lesson)
    .values({
      userId,
      unitId,
      position,
      kind: "roleplay",
      roleplayKind: kind,
      roleplayScenario: scenario,
      tone,
      textMode,
      title: plan?.title ?? titles[kind],
      objective: plan?.objective ?? objectives[kind],
      startedAt: plan ? null : now(),
    })
    .returning();
  return row!;
}

// The Roleplay a Unit ends with takes its kind from the Learner's Goals.
export async function roleplayKindFor({ db }: { db: Tx }, userId: string): Promise<RoleplayKind> {
  const kinds = (
    await db
      .select({ kind: goal.kind })
      .from(goal)
      .where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")))
  ).map((g) => g.kind);
  return kinds.includes("job_interview") || !kinds.includes("client_communication") ? "mock_interview" : "client_call";
}

const toneText: Record<Tone, string> = {
  friendly: "Friendly: warm and encouraging, gentle follow-ups.",
  standard: "Standard: professional and neutral.",
  tough: "Tough: brisk and sceptical; push back and probe with follow-ups.",
};

const scenarios: Record<RoleplayKind, string> = {
  mock_interview: `You are the interviewer in a Mock Interview for the job the Learner is preparing for. Mix questions about
their CV and experience, behavioural questions they should answer with STAR (situation, task, action, result), a request to
explain a project they worked on, and finish with "Do you have any questions for us?".`,
  client_call: `You are a client on a Client Call with the Learner. Make it realistic for their work: you explain what you need,
raise a problem or a delay, push back on scope, price or timing, and agree next steps.`,
  presentation: `You are an audience member at the Learner's Presentation. Listen to their talk, ask about the main point,
the evidence behind it, the implications and the next steps, and raise one challenging but fair question.`,
  team_meeting: `You are a teammate in a Team Meeting with the Learner. Discuss progress, blockers, priorities and decisions,
disagree where it is natural to disagree, and agree concrete next steps.`,
  phone_call: `You are the person on the other end of a Phone Call with the Learner. Explain why you are calling, ask for
information, raise a small problem or delay, and agree next steps.`,
  small_talk: `You are meeting the Learner casually for Small Talk. Chat about the day, work, travel, food or interests,
and keep the conversation light and natural.`,
  custom: `You are the other person in a situation the Learner described. Play that person and keep the conversation realistic.`,
};

// Instructions for a Roleplay, spoken or in text. Reused by text-mode Roleplays.
export const roleplayInstructions = (
  kind: RoleplayKind,
  tone: Tone,
  briefs: string[],
  scenario: string | null = null,
  spoken = false,
) =>
  `${
    kind === "custom" && scenario
      ? `You are the other person in this situation the Learner described:\n${scenario}\nPlay that person and keep the conversation realistic.`
      : scenarios[kind]
  }
Tone — ${toneText[tone]}
${briefs.length ? `What you know about the Learner:\n${briefs.join("\n\n")}` : ""}
Ask exactly one question at a time. After each answer, base the next question or follow-up on details in that last answer;
do not use a prewritten list or ask several questions together. Do not agree, praise, reassure, or validate the Learner's
answer. Stay in character and probe unclear claims, trade-offs, decisions, and outcomes. The Learner is practising English:
never correct them or give feedback during the Roleplay, and never judge whether their technical answers are right.${
    spoken
      ? `\nWhen the conversation is complete, say a short closing sentence such as "I'm ending the call now." Then call end_call. Do not call it before you have spoken the closing sentence.`
      : ""
  }`;

export const roleplays = (deps: Deps & { settings: { alphaLesson: number }; broker: RealtimeBroker }) => {
  const { db, broker } = deps;
  const find = async (id: string, userId: string) =>
    (
      await db
        .select()
        .from(lesson)
        .where(and(eq(lesson.id, id), eq(lesson.userId, userId), eq(lesson.kind, "roleplay")))
    )[0];

  return (
    new Hono<AppEnv>()
      .get("/", async (c) =>
        c.json(
          await db
            .select({
              id: lesson.id,
              title: lesson.title,
              roleplayKind: lesson.roleplayKind,
              roleplayScenario: lesson.roleplayScenario,
              tone: lesson.tone,
              textMode: lesson.textMode,
              status: lesson.status,
              unitId: lesson.unitId,
              startedAt: lesson.startedAt,
              completedAt: lesson.completedAt,
            })
            .from(lesson)
            .where(and(eq(lesson.userId, c.var.user.id), eq(lesson.kind, "roleplay")))
            .orderBy(desc(lesson.startedAt), desc(lesson.id)),
        ),
      )
      // Start a Roleplay any time from a Goal. The kind follows the Goal unless the Learner picks one.
      .post(
        "/",
        zValidator(
          "json",
          z.object({
            goalId: z.string(),
            kind: roleplayKind.optional(),
            scenario: roleplayScenario.optional(),
            tone: z.enum(["friendly", "standard", "tough"]).optional(),
            textMode: z.boolean().optional(),
          }),
        ),
        async (c) => {
          const userId = c.var.user.id;
          const { goalId, kind, scenario, tone, textMode } = c.req.valid("json");
          const [g] = await db
            .select({ kind: goal.kind })
            .from(goal)
            .where(and(eq(goal.id, goalId), eq(goal.userId, userId)));
          if (!g) return c.json({ error: "Goal not found" }, 404);
          const fromGoal = { job_interview: "mock_interview", client_communication: "client_call" } as const;
          const chosen = scenario ? "custom" : (kind ?? fromGoal[g.kind as keyof typeof fromGoal]);
          if (!chosen) return c.json({ error: "Choose a Roleplay or describe your own" }, 400);
          if (chosen === "custom" && !scenario) return c.json({ error: "Describe your Roleplay" }, 400);
          return c.json(await createRoleplay(deps, userId, { kind: chosen, scenario, tone, textMode }), 201);
        },
      )
      // The text-mode Roleplay: the same character as a chat, one message at a time, history kept on the server.
      // Chatting before any call switches a Roleplay to text, so one at the end of a Unit can be done in text too.
      .post("/:id/chat", zValidator("json", z.object({ message: learnerMessage })), async (c) => {
        const userId = c.var.user.id;
        const row = await find(c.req.param("id"), userId);
        if (!row) return c.json({ error: "Roleplay not found" }, 404);
        if (row.status !== "in_progress") return c.json({ error: "This Roleplay has ended" }, 409);
        const stored = row.messages as UIMessage[];
        if (!row.textMode && stored.length)
          return c.json({ error: "This Roleplay is being spoken; carry on in the call" }, 409);

        const valid = await safeValidateUIMessages({ messages: [...stored, c.req.valid("json").message] });
        if (!valid.success || valid.data.at(-1)!.role !== "user")
          return c.json({ error: "Expected a message from the Learner" }, 400);
        if (!row.textMode || !row.startedAt)
          await db
            .update(lesson)
            .set({ textMode: true, startedAt: row.startedAt ?? deps.now() })
            .where(eq(lesson.id, row.id));

        return streamChat(deps, userId, {
          model: deps.models.step,
          instructions: `${roleplayInstructions(row.roleplayKind!, row.tone!, await confirmedGoalTexts(deps, userId), row.roleplayScenario)}
This Roleplay is a text chat: write your lines as you would say them, without stage directions.`,
          messages: valid.data,
          save: (messages) =>
            db
              .update(lesson)
              .set({ messages })
              .where(and(eq(lesson.id, row.id), unchanged(lesson.messages, stored.length)))
              .returning({ id: lesson.id }),
        });
      })
      // The browser posts its SDP offer and gets back only the SDP answer, as for a Voice Assessment.
      .post("/:id/call", async (c) => {
        const userId = c.var.user.id;
        const offer = await c.req.text();
        if (!offer || offer.length > 20_000) return c.json({ error: "Send the SDP offer as the request body" }, 400);
        const row = await find(c.req.param("id"), userId);
        if (!row) return c.json({ error: "Roleplay not found" }, 404);
        if (row.status !== "in_progress" || row.textMode)
          return c.json({ error: "Calls are only for a spoken Roleplay in progress" }, 409);

        const call = await broker.start(userId, {
          targetId: row.id,
          sdp: offer,
          instructions: roleplayInstructions(
            row.roleplayKind!,
            row.tone!,
            await confirmedGoalTexts(deps, userId),
            row.roleplayScenario,
            true,
          ),
          purpose: "roleplay",
          tools: [endCallTool],
          endTool: endCallTool.name,
          prior: row.messages,
          onTranscript: (messages) => db.update(lesson).set({ messages }).where(eq(lesson.id, row.id)),
        });
        if ("capped" in call) return c.json({ error: voiceLimitMessage, ...call.capped }, 429);
        if ("busy" in call) return c.json({ error: "You already have a live voice call" }, 409);
        if (!row.startedAt) await db.update(lesson).set({ startedAt: deps.now() }).where(eq(lesson.id, row.id));
        return c.body(call.answer, 201, { "content-type": "application/sdp" });
      })
      .post("/:id/end", async (c) => {
        const userId = c.var.user.id;
        const row = await find(c.req.param("id"), userId);
        if (!row) return c.json({ error: "Roleplay not found" }, 404);
        if (row.status !== "in_progress") return c.json({ error: "This Roleplay has ended" }, 409);
        if (!row.textMode) {
          // Hang up first, so the transcript holds everything that was said.
          await broker.hangup(userId, row.id);
        }
        const result = await completeLesson(deps, row.id, userId);
        if (result.status === "failed") return c.json({ error: "The Debrief couldn't be generated. Try again." }, 502);
        return c.json(result);
      })
  );
};
