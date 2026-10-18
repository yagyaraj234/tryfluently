import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { safeValidateUIMessages, type UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { streamChat } from "./ai";
import type { AppEnv, Deps } from "./app";
import { completeLesson } from "./completion";
import { voiceMinutes, type RealtimeBroker } from "./realtime";

const { lesson, goal } = schema;

type RoleplayKind = "mock_interview" | "client_call";
type Tone = "friendly" | "standard" | "tough";
type Ctx = Pick<Deps, "db" | "now">;

// Learner-facing names. "Interview" only ever appears as "Mock Interview".
const titles: Record<RoleplayKind, string> = { mock_interview: "Mock Interview", client_call: "Client Call" };
const objectives: Record<RoleplayKind, string> = {
  mock_interview: "Answer Mock Interview questions in clear, natural English",
  client_call: "Handle a Client Call in clear, natural English",
};

const confirmedBriefs = async ({ db }: Pick<Deps, "db">, userId: string) =>
  (await db.select({ brief: goal.brief }).from(goal).where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")))).flatMap(
    (g) => (g.brief ? [g.brief] : []),
  );

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
  }: { kind: RoleplayKind; tone?: Tone; unitId?: string | null; position?: number; textMode?: boolean },
) {
  const [row] = await db
    .insert(lesson)
    .values({
      userId,
      unitId,
      position,
      kind: "roleplay",
      roleplayKind: kind,
      tone,
      textMode,
      title: titles[kind],
      objective: objectives[kind],
      startedAt: now(),
    })
    .returning();
  return row!;
}

// The Roleplay a Unit ends with takes its kind from the Learner's Goals.
export async function roleplayKindFor({ db }: Pick<Deps, "db">, userId: string): Promise<RoleplayKind> {
  const kinds = (await db.select({ kind: goal.kind }).from(goal).where(and(eq(goal.userId, userId), eq(goal.status, "confirmed")))).map(
    (g) => g.kind,
  );
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
};

// Instructions for a Roleplay, spoken or in text. Reused by text-mode Roleplays.
export const roleplayInstructions = (kind: RoleplayKind, tone: Tone, briefs: string[]) =>
  `${scenarios[kind]}
Tone — ${toneText[tone]}
${briefs.length ? `What you know about the Learner:\n${briefs.join("\n\n")}` : ""}
Ask 5–7 main questions over 8–12 minutes, one at a time, with natural follow-ups. Stay in character the whole time.
The Learner is practising English: never correct them or give feedback during the Roleplay, and never judge whether
their technical answers are right.`;

export const roleplays = (deps: Deps & { settings: { alphaLesson: number; realtimeMinutesPerDay: number }; broker: RealtimeBroker }) => {
  const { db, broker } = deps;
  const find = async (id: string, userId: string) =>
    (await db.select().from(lesson).where(and(eq(lesson.id, id), eq(lesson.userId, userId), eq(lesson.kind, "roleplay"))))[0];

  return new Hono<AppEnv>()
    // Start a Roleplay any time from a Goal. The kind follows the Goal unless the Learner picks one.
    .post(
      "/",
      zValidator(
        "json",
        z.object({
          goalId: z.string(),
          kind: z.enum(["mock_interview", "client_call"]).optional(),
          tone: z.enum(["friendly", "standard", "tough"]).optional(),
          textMode: z.boolean().optional(),
        }),
      ),
      async (c) => {
        const userId = c.var.user.id;
        const { goalId, kind, tone, textMode } = c.req.valid("json");
        const [g] = await db.select({ kind: goal.kind }).from(goal).where(and(eq(goal.id, goalId), eq(goal.userId, userId)));
        if (!g) return c.json({ error: "Goal not found" }, 404);
        const fromGoal = { job_interview: "mock_interview", client_communication: "client_call" } as const;
        const chosen = kind ?? fromGoal[g.kind as keyof typeof fromGoal];
        if (!chosen) return c.json({ error: "Choose a Mock Interview or a Client Call" }, 400);
        return c.json(await createRoleplay(deps, userId, { kind: chosen, tone, textMode }), 201);
      },
    )
    // The text-mode Roleplay: the same character as a chat, one message at a time, history kept on the server.
    // Chatting before any call switches a Roleplay to text, so one at the end of a Unit can be done in text too.
    .post("/:id/chat", zValidator("json", z.object({ message: z.unknown() })), async (c) => {
      const userId = c.var.user.id;
      const row = await find(c.req.param("id"), userId);
      if (!row) return c.json({ error: "Roleplay not found" }, 404);
      if (row.status !== "in_progress") return c.json({ error: "This Roleplay has ended" }, 409);
      const stored = row.messages as UIMessage[];
      if (!row.textMode && stored.length) return c.json({ error: "This Roleplay is being spoken; carry on in the call" }, 409);

      const valid = await safeValidateUIMessages({ messages: [...stored, c.req.valid("json").message] });
      if (!valid.success || valid.data.at(-1)!.role !== "user") return c.json({ error: "Expected a message from the Learner" }, 400);
      if (!row.textMode) await db.update(lesson).set({ textMode: true }).where(eq(lesson.id, row.id));

      return streamChat(deps, userId, {
        model: deps.models.step,
        instructions: `${roleplayInstructions(row.roleplayKind!, row.tone!, await confirmedBriefs(deps, userId))}
This Roleplay is a text chat: write your lines as you would say them, without stage directions.`,
        messages: valid.data,
        save: (messages) => db.update(lesson).set({ messages }).where(eq(lesson.id, row.id)),
      });
    })
    // The browser posts its SDP offer and gets back only the SDP answer, as for a Voice Assessment.
    .post("/:id/call", async (c) => {
      const userId = c.var.user.id;
      const offer = await c.req.text();
      if (!offer || offer.length > 20_000) return c.json({ error: "Send the SDP offer as the request body" }, 400);
      const row = await find(c.req.param("id"), userId);
      if (!row) return c.json({ error: "Roleplay not found" }, 404);
      if (row.status !== "in_progress" || row.textMode) return c.json({ error: "Calls are only for a spoken Roleplay in progress" }, 409);

      // The daily cap is enforced here, on the server: the call gets whatever is left of today's minutes.
      const budget = await voiceMinutes(broker, c.var.user, deps.settings.realtimeMinutesPerDay);
      if (budget.remainingSeconds <= 0)
        return c.json({ error: "You've used today's voice minutes. Try text mode, or come back tomorrow.", ...budget }, 429);

      const call = await broker.start(userId, {
        targetId: row.id,
        budgetSeconds: budget.remainingSeconds,
        sdp: offer,
        instructions: roleplayInstructions(row.roleplayKind!, row.tone!, await confirmedBriefs(deps, userId)),
        purpose: "roleplay",
        onTranscript: (messages) => db.update(lesson).set({ messages }).where(eq(lesson.id, row.id)),
      });
      if ("busy" in call) return c.json({ error: "You already have a live voice call" }, 409);
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
    });
};
