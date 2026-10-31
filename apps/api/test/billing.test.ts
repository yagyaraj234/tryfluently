import { describe, expect, test } from "bun:test";
import { schema } from "@fluently/db";
import DodoPayments from "dodopayments";
import { createHmac } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  armVoice,
  checkpointVoice,
  nextLocalMidnight,
  paidCredits,
  recoverVoice,
  reserveVoice,
  settleVoice,
} from "../src/billing-credits";
import { advanceUnit } from "../src/learning-memory";
import { finishPagedLesson } from "../src/paged-finish";
import { startLesson } from "../src/paged-lessons";
import { fakeRealtime, fakeTimers, get, json, makeApp, makeClock, signUp, WEB_ORIGIN } from "./helpers";
import { testDb } from "./setup";

const secret = Buffer.from("billing-test-signing-key-32-bytes!").toString("base64");
const env = { DODO_PRO_PRODUCT_ID: "pdt_pro", DODO_PACK_PRODUCT_ID: "pdt_pack" };

function gateway() {
  const payments = new Map<string, any>();
  const subscriptions = new Map<string, any>();
  const sessions = new Map<string, any>();
  const calls: { path: string; method: string; body: any }[] = [];
  let failCancel = false;
  const client = new DodoPayments({
    bearerToken: "test-only",
    webhookKey: `whsec_${secret}`,
    environment: "test_mode",
    maxRetries: 0,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const path = url.pathname;
      const body = request.method === "GET" ? null : JSON.parse((await request.text()) || "{}");
      calls.push({ path, method: request.method, body });
      let response: any;
      if (path.startsWith("/products/"))
        response = {
          price: path.endsWith("pdt_pro")
            ? {
                type: "recurring_price",
                currency: "USD",
                price: 900,
                tax_inclusive: true,
                payment_frequency_count: 1,
                payment_frequency_interval: "Month",
                subscription_period_count: 20,
                subscription_period_interval: "Year",
                trial_period_days: 0,
              }
            : { type: "one_time_price", currency: "USD", price: 2900, tax_inclusive: true },
        };
      else if (path === "/customers") response = { customer_id: `cus_${crypto.randomUUID()}` };
      else if (path === "/checkouts") {
        const id = `cks_${crypto.randomUUID()}`;
        sessions.set(id, { id, payment_status: null });
        response = { session_id: id, checkout_url: `https://test.checkout.dodopayments.com/session/${id}` };
      } else if (path.startsWith("/checkouts/")) response = sessions.get(path.split("/").at(-1)!);
      else if (path === "/subscriptions")
        response = {
          items:
            Number(url.searchParams.get("page_number") ?? 1) > 1
              ? []
              : [...subscriptions.values()].filter(
                  (s) => s.customer.customer_id === url.searchParams.get("customer_id"),
                ),
        };
      else if (path.startsWith("/subscriptions/")) {
        response = subscriptions.get(path.split("/").at(-1)!);
        if (request.method === "PATCH") {
          if (failCancel) return Response.json({ message: "Cancellation unavailable" }, { status: 503 });
          Object.assign(response, body);
        }
      } else if (path.startsWith("/payments/")) response = payments.get(path.split("/").at(-1)!);
      else if (path.includes("/customer-portal/"))
        response = { link: "https://customer.dodopayments.com/test-session" };
      else throw new Error(`Unexpected Dodo request ${request.method} ${path}`);
      if (!response) return Response.json({ message: "Not found" }, { status: 404 });
      return Response.json(response);
    },
  });
  return {
    client,
    payments,
    subscriptions,
    sessions,
    calls,
    failCancellation: () => {
      failCancel = true;
    },
  };
}

async function setup() {
  const clock = makeClock();
  const provider = gateway();
  const app = makeApp({ now: clock, payments: provider.client, env });
  const learner = await signUp(app);
  const customerId = `cus_${crypto.randomUUID()}`;
  await testDb.insert(schema.billingAccount).values({ userId: learner.id, customerId });
  return { app, clock, provider, ...learner, customerId };
}
type T = Awaited<ReturnType<typeof setup>>;

function payment(t: T, kind: "pack" | "pro", extra: Record<string, unknown> = {}): any {
  const id = `pay_${crypto.randomUUID()}`;
  const subId = `sub_${crypto.randomUUID()}`;
  const sub = {
    subscription_id: subId,
    customer: { customer_id: t.customerId },
    product_id: env.DODO_PRO_PRODUCT_ID,
    quantity: 1,
    status: "active",
    cancel_at_next_billing_date: false,
    next_billing_date: "2026-11-15T09:00:00Z",
    previous_billing_date: t.clock().toISOString(),
    metadata: { fluently_user_id: t.id },
  };
  if (kind === "pro") t.provider.subscriptions.set(subId, sub);
  const row = {
    payment_id: id,
    status: "succeeded",
    customer: { customer_id: t.customerId },
    created_at: t.clock().toISOString(),
    metadata: { fluently_user_id: t.id },
    refunds: [],
    disputes: [],
    currency: "USD",
    settlement_currency: "USD",
    total_amount: kind === "pack" ? 2900 : 900,
    settlement_amount: kind === "pack" ? 2900 : 900,
    is_update_payment_method: false,
    is_multi_subscription: false,
    subscription_ids: kind === "pro" ? [subId] : [],
    subscription_id: kind === "pro" ? subId : null,
    product_cart: kind === "pack" ? [{ product_id: env.DODO_PACK_PRODUCT_ID, quantity: 1 }] : null,
    service_periods:
      kind === "pro"
        ? [
            {
              subscription_id: subId,
              starts_at: t.clock().toISOString(),
              ends_at: sub.next_billing_date,
              proration_factor: "1",
            },
          ]
        : [],
    ...extra,
  };
  t.provider.payments.set(row.payment_id, row);
  return row;
}

function webhook(
  app: T["app"],
  type: string,
  data: object,
  id = `msg_${crypto.randomUUID()}`,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const body = JSON.stringify({ type, data, timestamp: new Date().toISOString(), business_id: "bus_test" });
  const signature = createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return app.request("/api/billing/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
    body,
  });
}
const state = async (t: T) => (await (await t.app.request("/api/billing", get(t.cookie))).json()) as any;

describe("payment grants", () => {
  test("Free defaults to 25 live minutes, five Lessons and no Pro access", async () => {
    const t = await setup();
    expect(await state(t)).toMatchObject({ hasPro: false, purchasedSeconds: 0, lessons: { limit: 5, used: 0 } });
    expect(await (await t.app.request("/api/voice-minutes", get(t.cookie))).json()).toMatchObject({
      limitMinutes: 25,
      remainingSeconds: 1500,
    });
  });

  test("signed pack payment grants 500 minutes once across webhook IDs and concurrent deliveries", async () => {
    const t = await setup();
    const p = payment(t, "pack");
    const id = `msg_${crypto.randomUUID()}`;
    expect((await webhook(t.app, "payment.succeeded", p, id)).status).toBe(200);
    const responses = await Promise.all([
      webhook(t.app, "payment.succeeded", p, id),
      webhook(t.app, "payment.succeeded", p),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    expect(await state(t)).toMatchObject({
      hasPro: true,
      source: "pack",
      purchasedSeconds: 30000,
      lessons: { limit: null },
    });
    expect(await testDb.select().from(schema.billingCredit).where(eq(schema.billingCredit.userId, t.id))).toHaveLength(
      1,
    );
  });

  test("rejects unsigned and stale webhook bodies", async () => {
    const t = await setup();
    const p = payment(t, "pack");
    expect((await t.app.request("/api/billing/webhook", json({ type: "payment.succeeded", data: p }))).status).toBe(
      401,
    );
    expect((await webhook(t.app, "payment.succeeded", p, undefined, Math.floor(Date.now() / 1000) - 3600)).status).toBe(
      401,
    );
    expect(await state(t)).toMatchObject({ purchasedSeconds: 0 });
  });

  test("mandate activation, processing payments and usage-only charges grant no minutes", async () => {
    const t = await setup();
    const p = payment(t, "pro", { status: "processing" });
    const sub = t.provider.subscriptions.get(p.subscription_id)!;
    expect((await webhook(t.app, "subscription.active", sub)).status).toBe(200);
    expect((await webhook(t.app, "payment.succeeded", p)).status).toBe(200);
    p.status = "succeeded";
    p.service_periods = [];
    expect((await webhook(t.app, "payment.succeeded", p)).status).toBe(200);
    expect(await state(t)).toMatchObject({ hasPro: false });
  });

  test("first paid period grants exactly 150, renewal resets and pack balance survives expiry", async () => {
    const t = await setup();
    const pro = payment(t, "pro");
    const pack = payment(t, "pack");
    await webhook(t.app, "payment.succeeded", pro);
    await webhook(t.app, "payment.succeeded", pack);
    await testDb
      .update(schema.billingCredit)
      .set({ usedSeconds: 8000 })
      .where(eq(schema.billingCredit.id, pro.payment_id));
    expect(await (await t.app.request("/api/voice-minutes", get(t.cookie))).json()).toMatchObject({
      limitMinutes: 150,
      monthlyRemainingSeconds: 1000,
      purchasedRemainingSeconds: 30000,
    });
    t.clock.set("2026-11-15T09:00:00Z");
    expect(await state(t)).toMatchObject({ source: "pack", purchasedSeconds: 30000, hasPro: true });
    expect((await paidCredits(testDb, t.id, t.clock())).pro).toBeUndefined();
    const renewal = payment(t, "pro", {
      subscription_id: pro.subscription_id,
      subscription_ids: [pro.subscription_id],
      service_periods: [
        {
          subscription_id: pro.subscription_id,
          starts_at: t.clock().toISOString(),
          ends_at: "2026-12-15T09:00:00Z",
          proration_factor: "1",
        },
      ],
    });
    await webhook(t.app, "payment.succeeded", renewal);
    expect(await (await t.app.request("/api/voice-minutes", get(t.cookie))).json()).toMatchObject({
      limitMinutes: 150,
      monthlyRemainingSeconds: 9000,
      purchasedRemainingSeconds: 30000,
    });
  });

  test("refund before payment delivery cannot resurrect credits; partial refunds affect only their purchase", async () => {
    const t = await setup();
    const p = payment(t, "pack");
    const other = payment(t, "pack");
    await webhook(t.app, "payment.succeeded", other);
    p.refunds = [{ status: "succeeded", is_partial: true, amount: 1450, currency: "USD" }];
    expect((await webhook(t.app, "refund.succeeded", { payment_id: p.payment_id })).status).toBe(200);
    await webhook(t.app, "payment.succeeded", p);
    expect(await state(t)).toMatchObject({ purchasedSeconds: 45000 });
    p.refunds.push({ status: "succeeded", is_partial: true, amount: 1450, currency: "USD" });
    await webhook(t.app, "refund.succeeded", { payment_id: p.payment_id });
    expect(await state(t)).toMatchObject({ purchasedSeconds: 30000 });
  });

  test("checkout binds the signed-in customer/product, disables trials and rejects a foreign origin", async () => {
    const t = await setup();
    const response = await t.app.request("/api/billing/checkout", json({ kind: "pro" }, t.cookie));
    expect(response.status).toBe(200);
    const sent = t.provider.calls.find((c) => c.path === "/checkouts")!.body;
    expect(sent).toMatchObject({
      customer: { customer_id: t.customerId },
      product_cart: [{ product_id: "pdt_pro", quantity: 1 }],
      subscription_data: { trial_period_days: 0 },
      return_url: `${WEB_ORIGIN}/profile?payment=return`,
    });
    expect(
      (
        await t.app.request("/api/billing/checkout", {
          ...json({ kind: "pack" }, t.cookie),
          headers: { origin: "https://evil.example", cookie: t.cookie, "content-type": "application/json" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await t.app.request("/api/billing/checkout", json({ kind: "pack", product_id: "evil" }, t.cookie))).status,
    ).toBe(200);
    expect(t.provider.calls.filter((c) => c.path === "/checkouts").at(-1)!.body.product_cart).toEqual([
      { product_id: "pdt_pack", quantity: 1 },
    ]);
  });

  test("an existing subscription blocks another checkout; cancellation preserves paid access", async () => {
    const t = await setup();
    const p = payment(t, "pro");
    await webhook(t.app, "payment.succeeded", p);
    expect((await t.app.request("/api/billing/checkout", json({ kind: "pro" }, t.cookie))).status).toBe(409);
    expect((await t.app.request("/api/billing/cancel", json({}, t.cookie))).status).toBe(200);
    expect(await state(t)).toMatchObject({ hasPro: true, subscription: { cancelAtPeriodEnd: true } });
    t.clock.set("2026-11-15T09:00:01Z");
    expect(await state(t)).toMatchObject({ hasPro: false });
  });

  test("provider cancellation failure blocks account deletion and preserves balances", async () => {
    const t = await setup();
    const p = payment(t, "pro");
    await webhook(t.app, "payment.succeeded", p);
    t.provider.failCancellation();
    const response = await t.app.request(
      "/api/auth/delete-user",
      json({ password: "correct-horse-battery" }, t.cookie),
    );
    expect(response.ok).toBe(false);
    expect((await t.app.request("/api/me", get(t.cookie))).status).toBe(200);
    expect(await state(t)).toMatchObject({ hasPro: true });
    expect(
      (await testDb.select().from(schema.billingAccount).where(eq(schema.billingAccount.userId, t.id)))[0]!.deleting,
    ).toBe(false);
  });
});

test("deletion cancels renewal before deleting data, and late checkout cannot create a renewing orphan", async () => {
  const t = await setup();
  const p = payment(t, "pro");
  await webhook(t.app, "payment.succeeded", p);
  expect((await t.app.request("/api/auth/delete-user", json({ password: "correct-horse-battery" }, t.cookie))).ok).toBe(
    true,
  );
  expect(t.provider.subscriptions.get(p.subscription_id).status).toBe("cancelled");
  expect((await t.app.request("/api/me", get(t.cookie))).status).toBe(401);
  const late = payment(t, "pro");
  expect((await webhook(t.app, "payment.succeeded", late)).status).toBe(200);
  expect(t.provider.subscriptions.get(late.subscription_id).status).toBe("cancelled");
  expect(await testDb.select().from(schema.billingCredit).where(eq(schema.billingCredit.userId, t.id))).toHaveLength(0);
});

test("failed reconciliation remains retryable and a later delivery grants only once", async () => {
  const t = await setup();
  const id = `pay_${crypto.randomUUID()}`,
    delivery = `msg_${crypto.randomUUID()}`;
  expect((await webhook(t.app, "payment.succeeded", { payment_id: id }, delivery)).status).toBe(503);
  const p = payment(t, "pack", { payment_id: id });
  expect((await webhook(t.app, "payment.succeeded", p, delivery)).status).toBe(200);
  expect(await state(t)).toMatchObject({ purchasedSeconds: 30000 });
});

test("a broker call consumes purchased minutes after monthly exhaustion and removes pack-only Pro at zero", async () => {
  const t = await setup();
  const p = payment(t, "pack");
  await webhook(t.app, "payment.succeeded", p);
  await testDb
    .update(schema.billingCredit)
    .set({ usedSeconds: 29940 })
    .where(eq(schema.billingCredit.id, p.payment_id));
  await testDb
    .insert(schema.aiUsage)
    .values({ userId: t.id, kind: "realtime", startedAt: new Date(t.clock().getTime() - 1500000), seconds: 1500 });
  const realtime = fakeRealtime(),
    timers = fakeTimers();
  const app = makeApp({ now: t.clock, realtime, schedule: timers.schedule });
  const res = await app.request("/api/assessments", json({ mode: "voice" }, t.cookie));
  const { id } = (await res.json()) as any;
  const offer = {
    method: "POST",
    headers: { cookie: t.cookie, origin: WEB_ORIGIN, "content-type": "application/sdp" },
    body: "v=0",
  };
  expect((await app.request(`/api/assessments/${id}/call`, offer)).status).toBe(201);
  t.clock.advance({ seconds: 40 });
  expect(await (await app.request("/api/voice-minutes", get(t.cookie))).json()).toMatchObject({
    remainingSeconds: 20,
    purchasedRemainingSeconds: 20,
  });
  await realtime.sideband().close();
  expect((await paidCredits(testDb, t.id, t.clock())).purchasedSeconds).toBe(20);
  expect((await app.request(`/api/assessments/${id}/call`, offer)).status).toBe(201);
  t.clock.advance({ seconds: 20 });
  await timers.fire(20000);
  expect((await paidCredits(testDb, t.id, t.clock())).hasPro).toBe(false);
});

describe("voice credit reservations", () => {
  test("crash recovery charges only confirmed activity and returns unobserved reserved seconds", async () => {
    const t = await setup();
    const p = payment(t, "pack");
    await webhook(t.app, "payment.succeeded", p);
    const r = await reserveVoice(testDb, t.id, t.clock(), 0, 20);
    await armVoice(testDb, r.reservation!.id, t.clock(), r.reservation!.endsAt, "rtc_recovery");
    await checkpointVoice(testDb, r.reservation!.id, 7);
    t.clock.advance({ seconds: 20 });
    await recoverVoice(testDb, t.id, t.clock());
    await recoverVoice(testDb, t.id, t.clock());
    expect((await paidCredits(testDb, t.id, t.clock())).purchasedSeconds).toBe(29993);
    expect(
      (await testDb.select().from(schema.aiUsage).where(eq(schema.aiUsage.id, r.reservation!.id)))[0]!.seconds,
    ).toBe(7);
  });
  test("monthly seconds precede pack seconds; unused reservations return on close exactly once", async () => {
    const t = await setup();
    const p = payment(t, "pack");
    await webhook(t.app, "payment.succeeded", p);
    const reserved = await reserveVoice(testDb, t.id, t.clock(), 60, 180);
    expect(reserved.reservation).toBeDefined();
    expect(reserved.reservation!.allocations).toEqual([{ creditId: p.payment_id, seconds: 120 }]);
    expect(await reserveVoice(testDb, t.id, t.clock(), 60, 180)).toEqual({ busy: true });
    await armVoice(testDb, reserved.reservation!.id, t.clock(), new Date(t.clock().getTime() + 180000), "rtc_reserved");
    t.clock.advance({ seconds: 90 });
    expect((await paidCredits(testDb, t.id, t.clock())).purchasedSeconds).toBe(29970);
    await settleVoice(testDb, reserved.reservation!.id, t.clock(), 90);
    await settleVoice(testDb, reserved.reservation!.id, t.clock(), 90);
    expect((await paidCredits(testDb, t.id, t.clock())).purchasedSeconds).toBe(29970);
  });

  test("Pro monthly credits spend first and exhausting the pack removes pack-only benefits", async () => {
    const t = await setup();
    const p = payment(t, "pro");
    const pack = payment(t, "pack");
    await webhook(t.app, "payment.succeeded", p);
    await webhook(t.app, "payment.succeeded", pack);
    await testDb
      .update(schema.billingCredit)
      .set({ usedSeconds: 8990 })
      .where(eq(schema.billingCredit.id, p.payment_id));
    const r = await reserveVoice(testDb, t.id, t.clock(), 1500, 20);
    expect(r.reservation!.allocations).toEqual([
      { creditId: p.payment_id, seconds: 10 },
      { creditId: pack.payment_id, seconds: 10 },
    ]);
    await settleVoice(testDb, r.reservation!.id, t.clock(), 20);
    t.clock.set("2026-12-01T00:00:00Z");
    expect((await paidCredits(testDb, t.id, t.clock())).hasPro).toBe(true);
    await testDb
      .update(schema.billingCredit)
      .set({ usedSeconds: 30000 })
      .where(eq(schema.billingCredit.id, pack.payment_id));
    expect((await paidCredits(testDb, t.id, t.clock())).hasPro).toBe(false);
  });

  test("failed provider call refunds its reservation", async () => {
    const t = await setup();
    const p = payment(t, "pro");
    await webhook(t.app, "payment.succeeded", p);
    const reserved = await reserveVoice(testDb, t.id, t.clock(), 0, 60);
    await settleVoice(testDb, reserved.reservation!.id, t.clock(), 0);
    expect((await paidCredits(testDb, t.id, t.clock())).pro!.remaining).toBe(9000);
    expect(
      await testDb
        .select()
        .from(schema.voiceReservation)
        .where(and(eq(schema.voiceReservation.userId, t.id), isNull(schema.voiceReservation.settledAt))),
    ).toHaveLength(0);
  });
});

describe("Lesson allowance and premium actions", () => {
  async function lessons(t: T) {
    const [unit] = await testDb
      .insert(schema.unit)
      .values({
        userId: t.id,
        position: 0,
        title: "Routines",
        objective: "Talk about routines",
        skills: ["grammar"],
        status: "active",
        createdAt: t.clock(),
        lessonOutline: Array.from({ length: 7 }, (_, position) => ({
          position,
          title: `Lesson ${position}`,
          objective: "Practise",
          kind: "practice" as const,
          skill: "grammar" as const,
          pageCount: 4,
        })),
      })
      .returning();
    return unit!;
  }
  test("Free allows five new Lessons, resumes don't count, local reset restores allowance", async () => {
    const t = await setup();
    await lessons(t);
    for (let position = 0; position < 5; position++) {
      const started = await startLesson({ db: testDb, now: t.clock }, t.id, position);
      expect(started.lesson).toBeDefined();
      expect((await startLesson({ db: testDb, now: t.clock }, t.id, position)).created).toBeUndefined();
      await testDb
        .update(schema.lesson)
        .set({ status: "completed", completedAt: t.clock() })
        .where(eq(schema.lesson.id, started.lesson!.id));
    }
    await expect(startLesson({ db: testDb, now: t.clock }, t.id, 5)).rejects.toThrow("today's 5 Lessons");
    await testDb.update(schema.user).set({ timezone: "Pacific/Kiritimati" }).where(eq(schema.user.id, t.id));
    await expect(startLesson({ db: testDb, now: t.clock }, t.id, 5)).rejects.toThrow("today's 5 Lessons");
    t.clock.advance({ days: 1 });
    expect((await startLesson({ db: testDb, now: t.clock }, t.id, 5)).created).toBe(true);
  });

  test("a positive pack balance removes the daily limit and enables skipping without completion credit", async () => {
    const t = await setup();
    const unit = await lessons(t);
    expect((await t.app.request("/api/lessons/0/skip", json({}, t.cookie))).status).toBe(403);
    const p = payment(t, "pack");
    await webhook(t.app, "payment.succeeded", p);
    await testDb
      .insert(schema.lessonAllowance)
      .values({ userId: t.id, used: 99, resetsAt: new Date("2026-10-16T00:00:00Z") });
    expect((await startLesson({ db: testDb, now: t.clock }, t.id, 0)).created).toBe(true);
    expect((await t.app.request("/api/lessons/0/skip", json({}, t.cookie))).status).toBe(200);
    expect((await startLesson({ db: testDb, now: t.clock }, t.id, 1)).created).toBe(true);
    const progress = await (await t.app.request("/api/progress", get(t.cookie))).json();
    expect(progress).toMatchObject({ xp: 0, streak: 0, learning: { completedLessons: 0 } });
    expect((await t.app.request(`/api/roadmap/units/${unit.id}/skip`, json({}, t.cookie))).status).toBe(200);
  });

  test("skipped Lessons retain their status while remaining completions master the Unit", async () => {
    const t = await setup();
    const unit = await lessons(t);
    await webhook(t.app, "payment.succeeded", payment(t, "pack"));
    const started = await startLesson({ db: testDb, now: t.clock }, t.id, 0);
    expect((await t.app.request("/api/lessons/0/skip", json({}, t.cookie))).status).toBe(200);
    expect(await finishPagedLesson({ db: testDb, now: t.clock, settings: { alphaLesson: 0.15 } }, started.lesson!.id, t.id)).toEqual({ status: "skipped" });
    await testDb.insert(schema.lesson).values(unit.lessonOutline.slice(1).map((p) => ({
      userId: t.id, unitId: unit.id, position: p.position, title: p.title, objective: p.objective,
      kind: p.kind, status: "completed" as const, completedAt: t.clock(),
    })));
    await advanceUnit(testDb, unit.id);
    const [finished] = await testDb.select().from(schema.unit).where(eq(schema.unit.id, unit.id));
    expect(finished!.status).toBe("mastered");
    const progress = await (await t.app.request("/api/progress", get(t.cookie))).json();
    expect(progress.learning.completedLessons).toBe(unit.lessonOutline.length - 1);
  });

  test("streak recovery restores two missed days, adds no XP and can't be repeated or reset by a pack", async () => {
    const t = await setup();
    const p = payment(t, "pack");
    await webhook(t.app, "payment.succeeded", p);
    await testDb.insert(schema.lesson).values(
      ["2026-10-11", "2026-10-12", "2026-10-15"].map((day, position) => ({
        userId: t.id,
        position,
        title: "Done",
        objective: "Practise",
        kind: "practice" as const,
        status: "completed" as const,
        completedAt: new Date(`${day}T09:00:00Z`),
      })),
    );
    const before = (await (await t.app.request("/api/progress", get(t.cookie))).json()) as any;
    expect(before).toMatchObject({ streak: 1, xp: 60, restorableDays: ["2026-10-14", "2026-10-13"] });
    expect((await t.app.request("/api/progress/restore", json({}, t.cookie))).status).toBe(200);
    expect(await (await t.app.request("/api/progress", get(t.cookie))).json()).toMatchObject({ streak: 5, xp: 60 });
    expect((await t.app.request("/api/progress/restore", json({}, t.cookie))).status).toBe(409);
    const pack = payment(t, "pack");
    await webhook(t.app, "payment.succeeded", pack);
    expect((await t.app.request("/api/progress/restore", json({}, t.cookie))).status).toBe(409);
  });

  test("daily reset respects DST transitions", () => {
    expect(nextLocalMidnight(new Date("2026-03-08T06:00:00Z"), "America/New_York").toISOString()).toBe(
      "2026-03-09T04:00:00.000Z",
    );
    expect(nextLocalMidnight(new Date("2026-11-01T05:00:00Z"), "America/New_York").toISOString()).toBe(
      "2026-11-02T05:00:00.000Z",
    );
  });
});
