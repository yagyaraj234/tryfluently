import { schema, type Tx } from "@fluently/db";
import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { billingError } from "./billing-errors";

const { billingCredit: credit, voiceReservation: reservation } = schema;
export const PRO_MINUTES = 150;
export const PACK_MINUTES = 500;
export const FREE_LESSONS_PER_DAY = 5;
export const monthEnd = (at: Date) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));

function unused(row: typeof reservation.$inferSelect, seconds: number) {
  let left = Math.max(0, Math.ceil(seconds) - row.freeSeconds);
  return row.allocations.map((allocation) => {
    const spent = Math.min(left, allocation.seconds);
    left -= spent;
    return { creditId: allocation.creditId, seconds: allocation.seconds - spent };
  });
}

export async function paidCredits(db: Tx, userId: string, at: Date) {
  const [credits, [live]] = await Promise.all([
    db
      .select()
      .from(credit)
      .where(
        and(
          eq(credit.userId, userId),
          lte(credit.startsAt, at),
          or(isNull(credit.expiresAt), gt(credit.expiresAt, at)),
        ),
      )
      .orderBy(asc(credit.startsAt), asc(credit.id)),
    db
      .select()
      .from(reservation)
      .where(and(eq(reservation.userId, userId), isNull(reservation.settledAt))),
  ]);
  const unspent = new Map(
    live
      ? unused(
          live,
          !live.callId && at < live.endsAt
            ? 0
            : Math.max(0, Math.min(at.getTime(), live.endsAt.getTime()) - live.startedAt.getTime()) / 1000,
        ).map((a) => [a.creditId, a.seconds])
      : [],
  );
  const rows = credits.map((row) => {
    const spent = Math.max(0, row.usedSeconds - (unspent.get(row.id) ?? 0));
    return { ...row, spent, remaining: Math.max(0, row.seconds - row.revokedSeconds - spent) };
  });
  const pro = rows.filter((r) => r.kind === "pro" && r.revokedSeconds < r.seconds).at(-1);
  const packs = rows.filter((r) => r.kind === "pack" && r.remaining > 0);
  const purchasedSeconds = packs.reduce((sum, r) => sum + r.remaining, 0);
  return { pro, packs, purchasedSeconds, hasPro: Boolean(pro) || purchasedSeconds > 0 };
}

// Callers that also change learning state hold the same Learner lock.
export async function requirePro(db: Tx, userId: string, at: Date, enabled = true) {
  if (enabled && !(await paidCredits(db, userId, at)).hasPro) {
    throw billingError(403, "Pro access is required. Subscribe or add a minute pack from Profile.");
  }
}

async function settle(
  db: Tx,
  row: typeof reservation.$inferSelect,
  at: Date,
  seconds: number,
  usage?: { startedAt: Date; callId: string; usage: Record<string, unknown> },
) {
  if (row.settledAt) return;
  for (const allocation of unused(row, Math.max(0, seconds))) {
    await db
      .update(credit)
      .set({ usedSeconds: sql`greatest(0, ${credit.usedSeconds} - ${allocation.seconds})` })
      .where(eq(credit.id, allocation.creditId));
  }
  await db
    .insert(schema.aiUsage)
    .values({
      id: row.id,
      userId: row.userId,
      kind: "realtime",
      startedAt: usage?.startedAt ?? row.startedAt,
      seconds,
      callId: usage?.callId,
      usage: {
        ...(usage?.usage ?? { recoveredReservation: true }),
        freeSeconds: Math.min(Math.max(0, seconds), row.freeSeconds),
      },
    })
    .onConflictDoNothing();
  await db.update(reservation).set({ settledAt: at }).where(eq(reservation.id, row.id));
}

export async function settleVoice(
  db: Tx,
  id: string,
  at: Date,
  seconds: number,
  usage?: { startedAt: Date; callId: string; usage: Record<string, unknown> },
) {
  return db.transaction(async (tx) => {
    const [owner] = await tx.select({ userId: reservation.userId }).from(reservation).where(eq(reservation.id, id));
    if (!owner) return;
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, owner.userId)).for("update");
    const [row] = await tx.select().from(reservation).where(eq(reservation.id, id));
    if (row) await settle(tx, row, at, seconds, usage);
  });
}

export async function recoverVoice(db: Tx, userId: string, at: Date) {
  const [row] = await db
    .select()
    .from(reservation)
    .where(and(eq(reservation.userId, userId), isNull(reservation.settledAt), lte(reservation.endsAt, at)));
  // shortcut: recovery charges only persisted activity, add durable provider metering before exact crash recovery.
  if (row) await settleVoice(db, row.id, at, row.confirmedSeconds);
}

export async function checkpointVoice(db: Tx, id: string, seconds: number) {
  await db
    .update(reservation)
    .set({ confirmedSeconds: sql`greatest(${reservation.confirmedSeconds}, ${Math.max(0, seconds)})` })
    .where(and(eq(reservation.id, id), isNull(reservation.settledAt)));
}

// Legacy usage predates paid credits and was entirely free-funded.
export async function freeVoiceUsed(db: Tx, userId: string, at: Date, live?: { startedAt: Date; freeSeconds: number }) {
  const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
  const end = monthEnd(at);
  const rows = await db
    .select({ startedAt: schema.aiUsage.startedAt, seconds: schema.aiUsage.seconds, usage: schema.aiUsage.usage })
    .from(schema.aiUsage)
    .where(
      and(
        eq(schema.aiUsage.userId, userId),
        eq(schema.aiUsage.kind, "realtime"),
        lt(schema.aiUsage.startedAt, end),
        sql`${schema.aiUsage.startedAt} + ${schema.aiUsage.seconds} * interval '1 second' > ${start.toISOString()}::timestamp`,
      ),
    );
  const funded = rows.map((r) => ({
    startedAt: r.startedAt,
    seconds:
      typeof r.usage?.freeSeconds === "number" ? Math.min(r.seconds, Math.max(0, r.usage.freeSeconds)) : r.seconds,
  }));
  if (live) funded.push({ startedAt: live.startedAt, seconds: live.freeSeconds });
  return funded.reduce(
    (sum, row) =>
      sum +
      Math.max(
        0,
        Math.min(row.startedAt.getTime() + row.seconds * 1000, at.getTime(), end.getTime()) -
          Math.max(row.startedAt.getTime(), start.getTime()),
      ) /
        1000,
    0,
  );
}

// Money is reserved durably before the provider call; failure returns every reserved second.
export async function reserveVoice(
  db: Tx,
  userId: string,
  at: Date,
  freeLimitSeconds: number,
  budgetSeconds = Infinity,
) {
  return db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId)).for("update");
    const [account] = await tx.select().from(schema.billingAccount).where(eq(schema.billingAccount.userId, userId));
    if (account?.deleting) return { busy: true as const };
    const [open] = await tx
      .select()
      .from(reservation)
      .where(and(eq(reservation.userId, userId), isNull(reservation.settledAt)));
    if (open && open.endsAt > at) return { busy: true as const };
    if (open) await settle(tx, open, at, open.confirmedSeconds);
    const paid = await paidCredits(tx, userId, at);
    const monthlySeconds = paid.pro?.remaining ?? Math.max(0, freeLimitSeconds - (await freeVoiceUsed(tx, userId, at)));
    const available = monthlySeconds + paid.purchasedSeconds;
    // Paid reservations stop at renewal so expired minutes cannot fund the next billing period.
    const boundary = paid.pro?.expiresAt ?? monthEnd(at);
    const duration = Math.max(
      0,
      Math.floor(
        Math.min(
          available,
          budgetSeconds,
          30 * 60,
          paid.pro || paid.purchasedSeconds > 0 ? (boundary.getTime() - at.getTime()) / 1000 : Infinity,
        ),
      ),
    );
    if (!duration) return { capped: true as const };
    let left = Math.max(0, duration - (paid.pro ? 0 : monthlySeconds));
    const allocations: schema.VoiceAllocation[] = [];
    for (const row of [...(paid.pro ? [paid.pro] : []), ...paid.packs]) {
      const seconds = Math.min(left, row.remaining);
      if (!seconds) continue;
      allocations.push({ creditId: row.id, seconds });
      await tx
        .update(credit)
        .set({ usedSeconds: sql`${credit.usedSeconds} + ${seconds}` })
        .where(eq(credit.id, row.id));
      left -= seconds;
    }
    const [created] = await tx
      .insert(reservation)
      .values({
        userId,
        startedAt: at,
        endsAt: new Date(at.getTime() + duration * 1000),
        freeSeconds: paid.pro ? 0 : Math.min(duration, monthlySeconds),
        allocations,
      })
      .returning();
    return {
      reservation: created!,
      budgetSeconds: duration,
      boundary: paid.pro || paid.purchasedSeconds > 0 ? boundary : undefined,
    };
  });
}

export async function armVoice(db: Tx, id: string, startedAt: Date, endsAt: Date, callId: string) {
  await db.update(reservation).set({ startedAt, endsAt, callId }).where(eq(reservation.id, id));
}

// A reset is found by comparing local dates, including 23/25-hour DST days.
export function nextLocalMidnight(at: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone });
  const day = (date: Date) => formatter.format(date);
  const today = day(at);
  let low = at.getTime(),
    high = low + 48 * 3_600_000;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (day(new Date(mid)) === today) low = mid;
    else high = mid;
  }
  return new Date(high);
}

export async function dailyLessons(db: Tx, userId: string, at: Date) {
  const [learner] = await db
    .select({ timezone: schema.user.timezone })
    .from(schema.user)
    .where(eq(schema.user.id, userId));
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: learner!.timezone });
  const today = formatter.format(at);
  const recent = await db
    .select({ startedAt: schema.lesson.startedAt, resetsAt: schema.lesson.allowanceResetsAt })
    .from(schema.lesson)
    .where(
      and(
        eq(schema.lesson.userId, userId),
        eq(schema.lesson.kind, "practice"),
        isNotNull(schema.lesson.startedAt),
        gte(schema.lesson.startedAt, new Date(at.getTime() - 48 * 3600000)),
        lte(schema.lesson.startedAt, at),
      ),
    );
  const active = recent.filter((l) => l.resetsAt && l.resetsAt > at);
  const resetsAt =
    active.sort((a, b) => a.resetsAt!.getTime() - b.resetsAt!.getTime())[0]?.resetsAt ??
    nextLocalMidnight(at, learner!.timezone);
  const used = recent.filter((l) => (l.resetsAt ? l.resetsAt > at : formatter.format(l.startedAt!) === today)).length;
  return { used, resetsAt };
}

// The caller holds the Learner lock and inserts the Lesson in this transaction.
export async function claimLesson(db: Tx, userId: string, at: Date, enabled = true) {
  const allowance = await dailyLessons(db, userId, at);
  if (enabled && !(await paidCredits(db, userId, at)).hasPro && allowance.used >= FREE_LESSONS_PER_DAY) {
    throw billingError(
      429,
      `You've started today's ${FREE_LESSONS_PER_DAY} Lessons. Your allowance resets at ${allowance.resetsAt.toISOString()}. Resume a Lesson, or unlock Pro from Profile.`,
    );
  }
  return allowance.resetsAt;
}

export async function restorationPeriod(db: Tx, userId: string, at: Date, enabled = true) {
  const { pro, hasPro } = await paidCredits(db, userId, at);
  const [last] = await db
    .select()
    .from(schema.streakRestoration)
    .where(eq(schema.streakRestoration.userId, userId))
    .orderBy(desc(schema.streakRestoration.restoredAt))
    .limit(1);
  return {
    hasPro: !enabled || hasPro,
    available: !last || last.nextAvailableAt <= at,
    nextAvailableAt: last && last.nextAvailableAt > at ? last.nextAvailableAt : (pro?.expiresAt ?? monthEnd(at)),
    resetsAt: pro?.expiresAt ?? monthEnd(at),
  };
}
