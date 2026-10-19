import { schema, type Tx } from "@impromptu/db";
import { and, asc, desc, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { Deps } from "./app";
import { reportEmail } from "./mailer";
import { prepareNext } from "./preparation";
import { buildRoadmap } from "./roadmap";

const { assessmentJob: job, assessment, user, unit, lesson, goal } = schema;
const LEASE_MS = 120_000;

export async function enqueueAssessmentJobs(db: Tx, assessmentId: string, userId: string, at: Date) {
  await db
    .insert(job)
    .values((["report_email", "practice"] as const).map((kind) => ({ assessmentId, userId, kind, availableAt: at })))
    .onConflictDoNothing();
}

// Retains first-Report-only delivery; a failed send releases the claim for the worker's retry.
async function emailReport({ db, now, mailer, env }: Deps, assessmentId: string, userId: string) {
  const claimed = await db.transaction(async (tx) => {
    const [learner] = await tx.select({ email: user.email }).from(user).where(eq(user.id, userId)).for("update");
    if (!learner) return;
    const [row] = await tx
      .update(assessment)
      .set({ emailedAt: now() })
      .where(
        and(
          eq(assessment.id, assessmentId),
          eq(assessment.status, "completed"),
          sql`not exists (select 1 from ${assessment} where ${assessment.userId} = ${userId} and ${assessment.emailedAt} is not null and ${assessment.id} <> ${assessmentId})`,
        ),
      )
      .returning({ report: assessment.report });
    if (row?.report) return { email: learner.email, report: row.report };
  });
  if (!claimed) return;
  try {
    // shortcut: Resend deduplicates for 24 hours; longer outages need delivery reconciliation.
    await mailer.send(
      reportEmail(claimed.email, claimed.report as Parameters<typeof reportEmail>[1], env.WEB_ORIGIN),
      `assessment-report/${assessmentId}`,
    );
  } catch (error) {
    await db.update(assessment).set({ emailedAt: null }).where(eq(assessment.id, assessmentId));
    throw error;
  }
}

/** One bounded batch. Row leases recover interrupted work; tokens fence stale workers. */
export async function runAssessmentJobs(deps: Deps, userId?: string) {
  const { db, now } = deps;
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(job)
      .where(
        and(
          userId ? eq(job.userId, userId) : undefined,
          or(
            and(eq(job.status, "pending"), lte(job.availableAt, now())),
            and(eq(job.status, "running"), lte(job.lockedAt, new Date(now().getTime() - LEASE_MS))),
          ),
        ),
      )
      .orderBy(asc(job.availableAt))
      .limit(4)
      .for("update", { skipLocked: true });
    return Promise.all(
      rows.map(async (row) => {
        const [claimed] = await tx
          .update(job)
          .set({ status: "running", attempts: row.attempts + 1, lockedAt: now(), token: crypto.randomUUID() })
          .where(and(eq(job.assessmentId, row.assessmentId), eq(job.kind, row.kind)))
          .returning();
        return claimed!;
      }),
    );
  });
  await Promise.all(
    claimed.map(async (row) => {
      const mine = and(eq(job.assessmentId, row.assessmentId), eq(job.kind, row.kind), eq(job.token, row.token!));
      const heartbeat = setInterval(() => {
        void db
          .update(job)
          .set({ lockedAt: now() })
          .where(mine)
          .catch((error) => console.error("Assessment job heartbeat failed", error));
      }, 15_000);
      heartbeat.unref();
      try {
        if (row.kind === "report_email") await emailReport(deps, row.assessmentId, row.userId);
        else {
          const ctx = { ...deps, signal: AbortSignal.timeout(90_000) };
          const result = await buildRoadmap(ctx, row.userId);
          if (result === "failed") throw new Error("Roadmap generation failed");
          if (result !== "not_ready") {
            // A prior attempt may have saved Units before Lesson preparation failed.
            const next =
              result === "exists"
                ? await prepareNext(ctx, row.userId)
                : (
                    await db
                      .select({ preparation: lesson.preparation })
                      .from(lesson)
                      .innerJoin(unit, eq(lesson.unitId, unit.id))
                      .where(
                        and(eq(unit.userId, row.userId), eq(unit.status, "active"), eq(lesson.status, "in_progress")),
                      )
                      .limit(1)
                  )[0];
            if (next?.preparation === "failed" || next?.preparation === "preparing")
              throw new Error("Lesson preparation is not ready");
          }
        }
        await db.update(job).set({ status: "done", token: null, lockedAt: null }).where(mine);
      } catch (error) {
        console.error(`Assessment ${row.kind} job failed`, error);
        await db
          .update(job)
          .set({
            status: row.attempts >= 3 ? "failed" : "pending",
            token: null,
            lockedAt: null,
            availableAt: new Date(now().getTime() + row.attempts * 5_000),
          })
          .where(mine);
      } finally {
        clearInterval(heartbeat);
      }
    }),
  );
}

/** Runs inside the long-lived Bun API process; pending work survives process restarts. */
export function startAssessmentJobs(deps: Deps) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runAssessmentJobs(deps);
    } catch (error) {
      console.error("Assessment worker failed", error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 2_000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

export async function practicePreparation(db: Deps["db"], userId: string, at = new Date()) {
  const [latest] = await db
    .select({ id: assessment.id })
    .from(assessment)
    .where(and(eq(assessment.userId, userId), eq(assessment.status, "completed")))
    .orderBy(desc(assessment.endedAt))
    .limit(1);
  const statuses = new Set(
    (await db.select({ status: goal.status }).from(goal).where(eq(goal.userId, userId))).map((g) => g.status),
  );
  if (!latest || !statuses.has("confirmed") || statuses.has("proposed"))
    return { status: "not_ready" as const, lesson: null };
  const [active] = await db
    .select()
    .from(unit)
    .where(and(eq(unit.userId, userId), eq(unit.status, "active")))
    .limit(1);
  const [current] = active
    ? await db
        .select()
        .from(lesson)
        .where(and(eq(lesson.unitId, active.id), eq(lesson.status, "in_progress")))
        .orderBy(asc(lesson.position))
        .limit(1)
    : [];
  if (current && current.preparation !== "failed" && current.preparation !== "preparing")
    return { status: "ready" as const, lesson: { id: current.id, kind: current.kind, title: current.title } };
  if (
    current?.preparation === "preparing" &&
    current.preparationAt &&
    at.getTime() - current.preparationAt.getTime() < LEASE_MS
  )
    return { status: "preparing" as const, lesson: null };
  const [work] = await db
    .select()
    .from(job)
    .where(and(eq(job.assessmentId, latest.id), eq(job.kind, "practice")))
    .limit(1);
  if (work?.status === "pending" || work?.status === "running")
    return { status: work.status === "pending" ? ("pending" as const) : ("preparing" as const), lesson: null };
  // Legacy outlines and fully completed Roadmaps remain accessible.
  if (
    !current &&
    ((active && !active.lessonOutline.length) ||
      (!active && (await db.select({ id: unit.id }).from(unit).where(eq(unit.userId, userId)).limit(1)).length))
  )
    return { status: "ready" as const, lesson: null };
  return { status: "failed" as const, lesson: null };
}

export async function retryPracticePreparation(db: Deps["db"], userId: string, at: Date) {
  const [latest] = await db
    .select({ id: assessment.id })
    .from(assessment)
    .where(and(eq(assessment.userId, userId), eq(assessment.status, "completed")))
    .orderBy(desc(assessment.endedAt))
    .limit(1);
  if (!latest || (await practicePreparation(db, userId, at)).status === "not_ready") return false;
  await db
    .insert(job)
    .values({ assessmentId: latest.id, userId, kind: "practice", availableAt: at })
    .onConflictDoUpdate({
      target: [job.assessmentId, job.kind],
      set: { status: "pending", attempts: 0, availableAt: at, token: null, lockedAt: null },
      setWhere: inArray(job.status, ["done", "failed"]),
    });
  return true;
}
