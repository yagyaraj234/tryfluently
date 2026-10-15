import { schema } from "@impromptu/db";
import { zValidator } from "@hono/zod-validator";
import { NoObjectGeneratedError, Output, type UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { generate } from "./ai";
import type { AppEnv, Deps } from "./app";
import { speechSegments } from "./assessments";
import type { RealtimeBroker } from "./realtime";
import { progressUnit } from "./roadmap";
import { fluencyScore, recordScores, skillProfile, skills } from "./scoring";

const { lesson, step, goal, focusItem } = schema;

type RoleplayKind = "mock_interview" | "client_call";
type Tone = "friendly" | "standard" | "tough";
type Lesson = typeof lesson.$inferSelect;
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
  { kind, tone = "standard", unitId = null, position = 0 }: { kind: RoleplayKind; tone?: Tone; unitId?: string | null; position?: number },
) {
  const [row] = await db
    .insert(lesson)
    .values({ userId, unitId, position, kind: "roleplay", roleplayKind: kind, tone, title: titles[kind], objective: objectives[kind], startedAt: now() })
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

const skillResult = z.object({ score: z.number().min(0).max(100), evidence: z.array(z.string()) });

export const debriefOutput = z.object({
  overallImpression: z.string(),
  // One entry per main question; its follow-ups belong to it.
  questions: z
    .array(z.object({ question: z.string(), quote: z.string(), strongerPhrasing: z.string(), languageIssues: z.array(z.string()) }))
    .min(1),
  skills: z.object({ fluency: skillResult, grammar: skillResult, vocabulary: skillResult }).partial(),
  phrasesToLearn: z.array(z.string()).length(3),
  objectiveProgress: z.number().int().min(0).max(100),
  summary: z.string(),
});

const debriefInstructions = `You are an examiner for English as a second language. Read a Roleplay transcript and write
the Learner's Debrief. Judge their English only, never whether their technical or business answers are correct.
Give an overall impression. For each main question the Learner was asked (group follow-ups with their question), quote
what they said, give a stronger phrasing and list the language issues. Using the official CEFR descriptors, score 0–100
the skills (grammar, vocabulary, and fluency as how coherent and connected their speech is) they showed evidence of.
Give exactly 3 phrases to learn, rate how well they met the objective 0–100, and write a two-sentence summary.`;

const textOf = (messages: UIMessage[]) =>
  messages
    .map((m) => `${m.role === "user" ? "Learner" : "Character"}: ${m.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join(" ")}`)
    .join("\n");

// Writes the Debrief for a finished Roleplay: Steps, scores (fluency only from a spoken one), Focus Items, and
// completes the Lesson. Reused by text-mode Roleplays.
export async function debrief({ db, now, models, settings }: Ctx & Pick<Deps, "models"> & { settings: { alphaLesson: number } }, row: Lesson) {
  const transcript = row.messages as UIMessage[];
  if (!transcript.some((m) => m.role === "user")) {
    await db.update(lesson).set({ status: "abandoned" }).where(eq(lesson.id, row.id));
    return { status: "abandoned" as const };
  }

  let out: z.infer<typeof debriefOutput>;
  try {
    ({ output: out } = await generate({ db, now }, row.userId, {
      model: models.judge,
      instructions: debriefInstructions,
      prompt: `${titles[row.roleplayKind!]} (${row.tone}). Objective: ${row.objective}\n\n${textOf(transcript)}`,
      output: Output.object({ schema: debriefOutput }),
    }));
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) return { status: "failed" as const };
    throw e;
  }

  const at = now();
  const fluency = !row.textMode && out.skills.fluency ? fluencyScore(speechSegments(transcript), out.skills.fluency.score) : null;
  const results = {
    ...(out.skills.grammar && { grammar: out.skills.grammar.score }),
    ...(out.skills.vocabulary && { vocabulary: out.skills.vocabulary.score }),
    ...(fluency !== null && { fluency }),
  };
  const before = await skillProfile(db, row.userId);
  await recordScores(db, row.userId, results, { alpha: settings.alphaLesson, source: "lesson", sourceId: row.id, at });
  const after = await skillProfile(db, row.userId);
  const skillChanges = Object.fromEntries(
    skills.filter((s) => s in results).map((s) => [s, { from: before[s]?.score ?? null, to: after[s]!.score }]),
  );

  const { overallImpression, questions, phrasesToLearn } = out;
  const debriefRecord = { textMode: row.textMode, overallImpression, questions, phrasesToLearn, skillChanges };
  await db.transaction(async (tx) => {
    await tx.insert(step).values(
      questions.map((q, position) => ({
        userId: row.userId,
        lessonId: row.id,
        position,
        type: "roleplayTurn" as const,
        mode: row.textMode ? ("text" as const) : ("voice" as const),
        input: { question: q.question },
        output: { answer: q.quote },
        feedback: {
          verdict: q.languageIssues.length ? ("almost" as const) : ("correct" as const),
          corrected: q.strongerPhrasing,
          explanation: q.languageIssues.join("; "),
        },
        answeredAt: at,
      })),
    );
    await tx.insert(focusItem).values(
      phrasesToLearn.map((label) => ({ userId: row.userId, label, kind: "phrase" as const, source: "debrief" as const, sourceId: row.id, createdAt: at })),
    );
    await tx
      .update(lesson)
      .set({ status: "completed", completedAt: at, debrief: debriefRecord, objectiveProgress: out.objectiveProgress, summary: out.summary })
      .where(eq(lesson.id, row.id));
  });
  if (row.unitId) await progressUnit({ db }, row.unitId);
  return { status: "completed" as const, debrief: debriefRecord };
}

export const roleplays = (deps: Deps & { settings: { alphaLesson: number }; broker: RealtimeBroker }) => {
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
        }),
      ),
      async (c) => {
        const userId = c.var.user.id;
        const { goalId, kind, tone } = c.req.valid("json");
        const [g] = await db.select({ kind: goal.kind }).from(goal).where(and(eq(goal.id, goalId), eq(goal.userId, userId)));
        if (!g) return c.json({ error: "Goal not found" }, 404);
        const fromGoal = { job_interview: "mock_interview", client_communication: "client_call" } as const;
        const chosen = kind ?? fromGoal[g.kind as keyof typeof fromGoal];
        if (!chosen) return c.json({ error: "Choose a Mock Interview or a Client Call" }, 400);
        return c.json(await createRoleplay(deps, userId, { kind: chosen, tone }), 201);
      },
    )
    // The browser posts its SDP offer and gets back only the SDP answer, as for a Voice Assessment.
    .post("/:id/call", async (c) => {
      const userId = c.var.user.id;
      const offer = await c.req.text();
      if (!offer || offer.length > 20_000) return c.json({ error: "Send the SDP offer as the request body" }, 400);
      const row = await find(c.req.param("id"), userId);
      if (!row) return c.json({ error: "Roleplay not found" }, 404);
      if (row.status !== "in_progress" || row.textMode) return c.json({ error: "Calls are only for a spoken Roleplay in progress" }, 409);

      const call = await broker.start(userId, {
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
      let row = await find(c.req.param("id"), userId);
      if (!row) return c.json({ error: "Roleplay not found" }, 404);
      if (row.status !== "in_progress") return c.json({ error: "This Roleplay has ended" }, 409);
      if (!row.textMode) {
        // Hang up first, so the transcript holds everything that was said.
        await broker.hangup(userId);
        row = (await find(row.id, userId))!;
      }
      const result = await debrief(deps, row);
      if (result.status === "failed") return c.json({ error: "The Debrief couldn't be generated. Try again." }, 502);
      return c.json(result);
    });
};
