import { schema, type Tx } from "@fluently/db";
import { zValidator } from "@hono/zod-validator";
import DodoPayments from "dodopayments";
import type { Payment } from "dodopayments/resources/payments";
import type { Subscription } from "dodopayments/resources/subscriptions";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { billingError } from "./billing-errors";
import { z } from "zod";
import type { AppEnv, Deps, User } from "./app";
import { dailyLessons, FREE_LESSONS_PER_DAY, PACK_MINUTES, paidCredits, PRO_MINUTES } from "./billing-credits";
import type { RealtimeBroker } from "./realtime";

const {
  billingAccount: account,
  billingCredit: credit,
  billingCheckout: checkout,
  billingSubscription: subscription,
} = schema;
type Ctx = Pick<Deps, "db" | "now" | "env" | "payments"> & { broker: RealtimeBroker };
const kindSchema = z.enum(["pro", "pack"]);

export function dodoPayments(env: Deps["env"]) {
  const keys = [
    env.DODO_PAYMENTS_API_KEY,
    env.DODO_PAYMENTS_WEBHOOK_KEY,
    env.DODO_PRO_PRODUCT_ID,
    env.DODO_PACK_PRODUCT_ID,
  ];
  if (!keys.some(Boolean)) return undefined;
  if (!keys.every(Boolean))
    throw new Error("Configure all four Dodo Payments credentials/product IDs before enabling billing");
  if (env.DODO_PAYMENTS_ENVIRONMENT !== "test_mode" && env.DODO_PAYMENTS_ENVIRONMENT !== "live_mode")
    throw new Error("DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode");
  if (env.DODO_PRO_PRODUCT_ID === env.DODO_PACK_PRODUCT_ID)
    throw new Error("Dodo Pro and minute pack require different products");
  return new DodoPayments({
    bearerToken: env.DODO_PAYMENTS_API_KEY,
    webhookKey: env.DODO_PAYMENTS_WEBHOOK_KEY,
    environment: env.DODO_PAYMENTS_ENVIRONMENT,
    timeout: 10_000,
    maxRetries: 1,
  });
}

const unavailable = () =>
  billingError(503, "Payments aren't available yet. Please try again later or contact support.");
const productId = (env: Deps["env"], kind: "pro" | "pack") =>
  kind === "pro" ? env.DODO_PRO_PRODUCT_ID! : env.DODO_PACK_PRODUCT_ID!;

// The dashboard controls prices. Fail closed rather than selling a misconfigured offer.
async function validateProduct(client: DodoPayments, id: string, kind: "pro" | "pack") {
  const { price } = await client.products.retrieve(id);
  if (
    price.type === "usage_based_price" ||
    price.currency !== "USD" ||
    price.price !== (kind === "pro" ? 900 : 2900) ||
    price.tax_inclusive !== true ||
    price.discount ||
    price.discount_bps ||
    price.purchasing_power_parity ||
    (price.type === "one_time_price" && price.pay_what_you_want)
  )
    throw unavailable();
  if (kind === "pack" && price.type !== "one_time_price") throw unavailable();
  if (
    kind === "pro" &&
    (price.type !== "recurring_price" ||
      price.payment_frequency_count !== 1 ||
      price.payment_frequency_interval !== "Month" ||
      price.subscription_period_interval !== "Year" ||
      price.subscription_period_count !== 20 ||
      price.trial_period_days)
  )
    throw unavailable();
}

async function saveSubscription(db: Tx, row: Subscription, userId: string) {
  await db
    .insert(subscription)
    .values({
      id: row.subscription_id,
      userId,
      status: row.status,
      cancelAtPeriodEnd: row.cancel_at_next_billing_date,
      nextBillingAt: new Date(row.next_billing_date),
    })
    .onConflictDoUpdate({
      target: subscription.id,
      set: {
        status: row.status,
        cancelAtPeriodEnd: row.cancel_at_next_billing_date,
        nextBillingAt: new Date(row.next_billing_date),
      },
    });
}

function refundedFraction(payment: Payment) {
  if (payment.disputes.some((d) => ["dispute_lost", "dispute_accepted"].includes(d.dispute_status))) return 1;
  let fraction = 0;
  for (const refund of payment.refunds) {
    if (refund.status !== "succeeded") continue;
    if (!refund.is_partial) return 1;
    const amount = refund.amount;
    const total =
      refund.currency === payment.currency
        ? payment.total_amount
        : refund.currency === payment.settlement_currency
          ? payment.settlement_amount
          : undefined;
    if (amount === undefined || amount === null || !total)
      throw new Error("Refund currency/amount cannot be reconciled");
    fraction += amount / total;
  }
  return Math.min(1, fraction);
}

async function reconcilePayment(ctx: Ctx, paymentId: string, webhookId: string, refundId?: string) {
  const client = ctx.payments!;
  const payment = await client.payments.retrieve(paymentId);
  if (
    payment.status !== "succeeded" ||
    payment.total_amount <= 0 ||
    payment.is_update_payment_method ||
    payment.is_multi_subscription
  )
    return;
  if (refundId && !payment.refunds.some((r) => r.refund_id === refundId && r.status === "succeeded"))
    throw new Error("Refund is not visible on the authoritative payment yet; retry delivery");
  const subscriptionId = payment.subscription_id ?? payment.subscription_ids[0];
  const sub = subscriptionId ? await client.subscriptions.retrieve(subscriptionId) : undefined;
  const first = payment.product_cart?.[0];
  const pack =
    !sub &&
    payment.product_cart?.length === 1 &&
    first?.product_id === ctx.env.DODO_PACK_PRODUCT_ID &&
    first?.quantity === 1;
  const service = sub && payment.service_periods.find((p) => p.subscription_id === sub.subscription_id);
  if (!pack && (!sub || sub.product_id !== ctx.env.DODO_PRO_PRODUCT_ID || sub.quantity !== 1 || !service)) return;
  if (sub && sub.customer.customer_id !== payment.customer.customer_id)
    throw new Error("Payment customer does not own subscription");
  const [owner] = await ctx.db.select().from(account).where(eq(account.customerId, payment.customer.customer_id));
  if (!owner) {
    // A saved checkout may finish after account deletion. Never leave its subscription renewing.
    const metadataId = payment.metadata.fluently_user_id ?? sub?.metadata.fluently_user_id;
    const userId = typeof metadataId === "string" ? metadataId : undefined;
    const [learner] = userId
      ? await ctx.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId))
      : [];
    if (learner) throw new Error("Billing account not committed yet; retry webhook");
    if (sub && !["cancelled", "expired", "failed"].includes(sub.status))
      await client.subscriptions.update(sub.subscription_id, { status: "cancelled" });
    return;
  }
  const seconds = (pack ? PACK_MINUTES : PRO_MINUTES) * 60;
  const startsAt = pack ? new Date(payment.created_at) : new Date(service!.starts_at);
  const expiresAt = pack ? null : new Date(service!.ends_at);
  if (
    !Number.isFinite(startsAt.getTime()) ||
    (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt))
  )
    throw new Error("Invalid paid service period");
  const revokedSeconds = Math.ceil(seconds * refundedFraction(payment));
  const [previous] = await ctx.db.select().from(credit).where(eq(credit.id, payment.payment_id));
  await ctx.db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, owner.userId)).for("update");
    const [receipt] = await tx
      .insert(schema.billingWebhook)
      .values({ id: webhookId, processedAt: ctx.now() })
      .onConflictDoNothing()
      .returning();
    if (!receipt) return;
    const [current] = await tx.select().from(account).where(eq(account.userId, owner.userId));
    if (!current || current.deleting) throw new Error("Account deletion in progress; retry webhook");
    await tx
      .insert(credit)
      .values({
        id: payment.payment_id,
        userId: owner.userId,
        kind: pack ? "pack" : "pro",
        subscriptionId: sub?.subscription_id,
        startsAt,
        expiresAt,
        seconds,
        revokedSeconds,
        amount: payment.total_amount,
        currency: payment.currency,
      })
      .onConflictDoUpdate({
        target: credit.id,
        set: { revokedSeconds: sql`greatest(${credit.revokedSeconds}, ${revokedSeconds})` },
      });
    if (payment.checkout_session_id)
      await tx
        .update(checkout)
        .set({ completedAt: ctx.now() })
        .where(and(eq(checkout.sessionId, payment.checkout_session_id), eq(checkout.userId, owner.userId)));
    if (sub) await saveSubscription(tx, sub, owner.userId);
  });
  // Revoke under the Learner lock first, so a new call cannot reserve credit between teardown and revocation.
  if (previous && revokedSeconds > previous.revokedSeconds) {
    try {
      await ctx.broker.hangup(owner.userId);
    } catch (error) {
      console.error("Refunded call teardown will retry", error);
    }
  }
}

export function billingWebhooks(ctx: Ctx) {
  return new Hono().post("/", async (c) => {
    if (!ctx.payments) throw unavailable();
    let event;
    try {
      event = ctx.payments.webhooks.unwrap(await c.req.text(), { headers: Object.fromEntries(c.req.raw.headers) });
    } catch {
      return c.json({ error: "Invalid webhook signature or payload" }, 401);
    }
    const id = c.req.header("webhook-id")!;
    if (
      (
        await ctx.db
          .select({ id: schema.billingWebhook.id })
          .from(schema.billingWebhook)
          .where(eq(schema.billingWebhook.id, id))
      ).length
    )
      return c.json({ received: true });
    try {
      if (
        event.type === "payment.succeeded" ||
        event.type === "refund.succeeded" ||
        event.type === "dispute.lost" ||
        event.type === "dispute.accepted"
      ) {
        await reconcilePayment(
          ctx,
          event.data.payment_id,
          id,
          event.type === "refund.succeeded" ? event.data.refund_id : undefined,
        );
      } else if (event.type.startsWith("subscription.") && "subscription_id" in event.data) {
        const row = await ctx.payments.subscriptions.retrieve(String(event.data.subscription_id));
        if (row.product_id === ctx.env.DODO_PRO_PRODUCT_ID) {
          const [owner] = await ctx.db.select().from(account).where(eq(account.customerId, row.customer.customer_id));
          if (owner && !owner.deleting) await saveSubscription(ctx.db, row, owner.userId);
          else if (!owner && !["cancelled", "expired", "failed"].includes(row.status)) {
            const userId = row.metadata.fluently_user_id;
            const [learner] =
              typeof userId === "string"
                ? await ctx.db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, userId))
                : [];
            if (learner) throw new Error("Billing account not committed yet");
            await ctx.payments.subscriptions.update(row.subscription_id, { status: "cancelled" });
          }
        }
      }
      await ctx.db.insert(schema.billingWebhook).values({ id, processedAt: ctx.now() }).onConflictDoNothing();
      return c.json({ received: true });
    } catch (error) {
      console.error("Billing webhook reconciliation failed", { webhookId: id, type: event.type, error });
      return c.json({ error: "Payment reconciliation failed; retry delivery" }, 503);
    }
  });
}

export function billingRoutes(ctx: Ctx) {
  return new Hono<AppEnv>()
    .get("/", async (c) => {
      const userId = c.var.user.id;
      const at = ctx.now();
      const [paid, allowance, [customer], subscriptions] = await Promise.all([
        paidCredits(ctx.db, userId, at),
        dailyLessons(ctx.db, userId, at),
        ctx.db.select().from(account).where(eq(account.userId, userId)),
        ctx.db
          .select()
          .from(subscription)
          .where(eq(subscription.userId, userId))
          .orderBy(desc(subscription.nextBillingAt)),
      ]);
      return c.json({
        enabled: Boolean(ctx.payments),
        hasPro: !ctx.payments || paid.hasPro,
        source: paid.pro ? ("subscription" as const) : paid.hasPro ? ("pack" as const) : ("free" as const),
        purchasedSeconds: Math.floor(paid.purchasedSeconds),
        paidUntil: paid.pro?.expiresAt?.toISOString() ?? null,
        subscription: subscriptions.find((s) => !["cancelled", "expired", "failed"].includes(s.status)) ?? null,
        canManage: Boolean(customer),
        lessons: {
          limit: !ctx.payments || paid.hasPro ? null : FREE_LESSONS_PER_DAY,
          used: allowance.used,
          resetsAt: allowance.resetsAt.toISOString(),
        },
      });
    })
    .post("/checkout", zValidator("json", z.object({ kind: kindSchema })), async (c) => {
      const client = ctx.payments;
      if (!client) throw unavailable();
      const { kind } = c.req.valid("json");
      const learner = c.var.user;
      await validateProduct(client, productId(ctx.env, kind), kind);
      return ctx.db.transaction(async (tx) => {
        await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, learner.id)).for("update");
        let [customer] = await tx.select().from(account).where(eq(account.userId, learner.id));
        if (customer?.deleting) throw billingError(409, "Account deletion is in progress.");
        if (!customer) {
          const created = await client.customers.create(
            { email: learner.email, name: learner.name },
            { idempotencyKey: `fluently-customer-${learner.id}` },
          );
          [customer] = await tx
            .insert(account)
            .values({ userId: learner.id, customerId: created.customer_id })
            .returning();
        }
        if (kind === "pro") {
          for await (const sub of client.subscriptions.list({ customer_id: customer!.customerId })) {
            if (
              sub.product_id === ctx.env.DODO_PRO_PRODUCT_ID &&
              !["cancelled", "expired", "failed"].includes(sub.status)
            )
              throw billingError(409, "You already have a subscription. Manage it from Profile.");
          }
          const [pending] = await tx
            .select()
            .from(checkout)
            .where(and(eq(checkout.userId, learner.id), eq(checkout.kind, "pro"), isNull(checkout.completedAt)))
            .orderBy(desc(checkout.createdAt))
            .limit(1);
          if (pending?.sessionId && pending.url) {
            const status = await client.checkoutSessions.retrieve(pending.sessionId);
            if (
              !status.payment_status ||
              status.payment_status === "processing" ||
              status.payment_status === "requires_customer_action"
            )
              return c.json({ url: pending.url });
            if (status.payment_status === "succeeded")
              throw billingError(409, "Your payment is being confirmed. Refresh Profile shortly.");
            await tx.update(checkout).set({ completedAt: ctx.now() }).where(eq(checkout.id, pending.id));
          }
        }
        const [purchase] = await tx
          .insert(checkout)
          .values({ userId: learner.id, kind, createdAt: ctx.now() })
          .returning();
        const session = await client.checkoutSessions.create(
          {
            product_cart: [{ product_id: productId(ctx.env, kind), quantity: 1 }],
            customer: { customer_id: customer!.customerId },
            metadata: { fluently_user_id: learner.id, fluently_checkout_id: purchase!.id },
            return_url: new URL("/profile?payment=return", ctx.env.WEB_ORIGIN).href,
            cancel_url: new URL("/profile", ctx.env.WEB_ORIGIN).href,
            subscription_data: kind === "pro" ? { trial_period_days: 0 } : undefined,
            feature_flags: { allow_discount_code: false, allow_currency_selection: true },
          },
          { idempotencyKey: purchase!.id },
        );
        if (!session.checkout_url) throw new Error("Dodo returned no hosted checkout URL");
        await tx
          .update(checkout)
          .set({ sessionId: session.session_id, url: session.checkout_url })
          .where(eq(checkout.id, purchase!.id));
        return c.json({ url: session.checkout_url });
      });
    })
    .post("/portal", async (c) => {
      if (!ctx.payments) throw unavailable();
      const [customer] = await ctx.db.select().from(account).where(eq(account.userId, c.var.user.id));
      if (!customer || customer.deleting) throw billingError(409, "No billing account is available.");
      const portal = await ctx.payments.customers.customerPortal.create(customer.customerId, {
        send_email: false,
        return_url: new URL("/profile", ctx.env.WEB_ORIGIN).href,
      });
      return c.json({ url: portal.link });
    })
    .post("/cancel", async (c) => {
      if (!ctx.payments) throw unavailable();
      const [customer] = await ctx.db.select().from(account).where(eq(account.userId, c.var.user.id));
      if (!customer || customer.deleting) throw billingError(409, "No subscription is available.");
      for await (const sub of ctx.payments.subscriptions.list({ customer_id: customer.customerId })) {
        if (sub.product_id !== ctx.env.DODO_PRO_PRODUCT_ID || ["cancelled", "expired", "failed"].includes(sub.status))
          continue;
        const row = await ctx.payments.subscriptions.update(sub.subscription_id, { cancel_at_next_billing_date: true });
        await saveSubscription(ctx.db, row, c.var.user.id);
      }
      return c.json({ cancelled: true });
    });
}

export async function cancelBeforeDelete(ctx: Ctx, learner: Pick<User, "id">) {
  await ctx.broker.hangup(learner.id);
  const [customer] = await ctx.db.transaction(async (tx) => {
    await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, learner.id)).for("update");
    return tx.update(account).set({ deleting: true }).where(eq(account.userId, learner.id)).returning();
  });
  if (!customer) return;
  try {
    if (!ctx.payments) throw unavailable();
    const checkouts = await ctx.db
      .select()
      .from(checkout)
      .where(and(eq(checkout.userId, learner.id), isNull(checkout.completedAt)));
    for (const pending of checkouts) {
      if (!pending.sessionId) continue;
      const status = await ctx.payments.checkoutSessions.retrieve(pending.sessionId);
      if (status.payment_status === "processing" || status.payment_status === "requires_customer_action")
        throw new Error("A payment is still processing");
    }
    for await (const sub of ctx.payments.subscriptions.list({ customer_id: customer.customerId })) {
      if (sub.product_id !== ctx.env.DODO_PRO_PRODUCT_ID || ["cancelled", "expired", "failed"].includes(sub.status))
        continue;
      const cancelled = await ctx.payments.subscriptions.update(sub.subscription_id, { status: "cancelled" });
      if (cancelled.status !== "cancelled") throw new Error("Subscription cancellation was not confirmed");
    }
  } catch (error) {
    await ctx.db.update(account).set({ deleting: false }).where(eq(account.userId, learner.id));
    console.error("Billing cancellation before deletion failed", error);
    throw billingError(503, "We couldn't cancel billing yet. Your account is intact. Wait for pending payments to finish, then try again or contact support.");
  }
}
