# Billing

Free includes 25 live minutes per UTC calendar month and five new Lessons per local day. Pro costs **$9/month including tax**, with 150 live minutes per paid billing period, unlimited daily Lesson starts, Lesson/Unit skipping and streak recovery. A **$29 tax-inclusive one-time pack** adds 500 non-expiring minutes and unlocks all Pro features while any purchased balance remains. Buying more packs stacks minutes, not recovery allowances. Keeping one purchased minute intentionally keeps Pro features indefinitely.

Monthly minutes are spent before purchased minutes. Pro gets 150 total, not 150 plus Free's 25. Recorded Lesson answers keep their separate 30-minute local-day cap. Assessments retain their existing per-assessment limits. Existing provider-spend rate limits still apply to all plans; unlimited Lessons means no daily Lesson count limit.

## Dodo setup

Use separate test and live credentials/products. All payment credentials stay on the API. Blank credentials leave checkout disabled while Free and already-granted balances continue working. A partial configuration fails startup.

1. In Dodo, create a recurring USD product: **900 cents, tax inclusive**, payment frequency **1 Month**, subscription duration **20 Years** (Dodo's renewable-until-cancelled configuration), no trial, discounts, purchasing-power-parity or usage billing. Create a second USD one-time product: **2900 cents, tax inclusive**, fixed price, quantity one. The API validates the advertised product before opening checkout.
2. Enable Adaptive Currency for local-currency checkout, including INR/Indian recurring methods where available to the merchant. Check conversion-charge display and customer totals in both India and another country. Do not configure localized fixed prices that contradict the advertised base prices. Disable subscription grace periods. Recovery retries may be enabled in Dodo; app benefits still require confirmed payment.
3. Set `DODO_PAYMENTS_ENVIRONMENT` to `test_mode` or `live_mode`, plus `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY`, `DODO_PRO_PRODUCT_ID` and `DODO_PACK_PRODUCT_ID`. Never use test products with a live key or vice versa.
4. Configure the webhook URL as `https://<app-origin>/api/billing/webhook`. Subscribe to `payment.succeeded`, `refund.succeeded`, subscription lifecycle events, `dispute.lost` and `dispute.accepted`. The web pass-through forwards the unchanged body. Dodo's SDK verifies the raw payload, signature and timestamp; persistent delivery/payment IDs prevent duplicate grants. Failed reconciliation returns 503 for retry.
5. Enable invoices and payment-method management in Dodo's customer portal. Keep product/plan switching and new subscription purchases in the portal disabled: this app sells one fixed subscription and opens its own authenticated checkout. Cancellation from Profile schedules the end of renewal; paid access remains through the confirmed service period.
6. Run the normal migration service before the new API. Migration `0021_faithful_sage.sql` is additive and adds billing, reservation, Lesson allowance and restoration records plus the `skipped` Lesson status. Existing learning rows and usage are preserved.

Official references: [checkout sessions](https://docs.dodopayments.com/api-reference/checkout-sessions/create), [subscription integration](https://docs.dodopayments.com/developer-resources/subscription-integration-guide), [India payment methods](https://docs.dodopayments.com/features/payment-methods/india), [webhooks](https://docs.dodopayments.com/developer-resources/webhooks), [tax-inclusive pricing](https://docs.dodopayments.com/features/tax-inclusive-pricing), [Adaptive Currency](https://docs.dodopayments.com/features/adaptive-currency).

## Payment lifecycle

- Only an authoritative successful payment grants minutes. Checkout redirects and `subscription.active` do not. India mandate authorization can precede collection; Profile polls briefly after returning and explains delayed confirmation.
- Each recurring payment must contain a paid service period for the configured Pro subscription. Usage-only and payment-method-update charges do not renew access. New billing periods get new grants; unused previous-period minutes expire.
- Cancellation does not revoke already-paid access. Failed renewal adds no grant and has no grace. Purchased balance survives subscription cancellation, non-payment and expiry.
- Refunds are manually reviewed and issued through Dodo. After a successful refund, remaining seconds from that payment are revoked proportionally; a full refund or lost/accepted dispute revokes that purchase completely. Other purchases remain untouched. Refunds do not automatically cancel subscription renewals. Revocations cannot be undone by replaying an older payment event.
- Account deletion hangs up voice, blocks checkout, checks pending payments and cancels all renewing subscriptions before deleting local data. Cancellation failure preserves the account. An old checkout completed after deletion receives no entitlement and its new subscription is cancelled by the webhook. The payment provider retains its own financial records.

## Learning behavior

Newly started practice Lessons count, including Learn more follow-ups and legacy generation paths. Pages, questions, Practice Rounds, resumes, reviews and generation retries do not consume another Lesson slot. Live Roleplays use the separate voice allowance. Follow-up creation and completion roll back together if the daily limit is reached. Reset timestamps stay fixed until the current day ends, so changing timezone cannot create a fresh allowance.

Skipping preserves completed work but grants no completion credit, XP or streak activity. Progression treats skipped positions as finished; a Unit containing skipped Lessons ends as skipped. Streak recovery is manual and restores only the latest gap of one or two local dates. Subscribers get one recovery per billing period; pack-only accounts get one per UTC calendar month. Changing payment type or buying another pack does not reset an already-used recovery. Restorations affect streaks/reminders, not completed Lessons, XP or actual weekly practice activity.

## Voice reservations and operations

Calls reserve paid seconds transactionally before provider creation, spending the monthly grant first and packs oldest first. Failed connection releases its reservation. Confirmed teardown records elapsed time, rounds paid usage up to whole seconds and releases unused credit exactly once. Active balances account for elapsed time rather than showing the entire reservation as spent. Calls involving paid credits stop at the applicable monthly/billing reset boundary; another call can use the renewed allowance.

The existing call registry/provider relay and rate windows still require **one API instance**. Durable reservations prevent overlapping spend, but do not make provider sockets and timers portable. Graceful shutdown drains calls. After an ungraceful process loss, the reservation stays locked until its recorded deadline and is recovered using only persisted activity checkpoints; unconfirmed seconds are released. Inspect `ai_usage.usage.recoveredReservation` and verify orphaned provider-call teardown against provider evidence. Unconfirmed time after process loss is not deducted from the purchased balance; providers may still bill the merchant. Provider call teardown and multi-instance recovery remain separate work; do not claim exact crash recovery or horizontal-scaling readiness.

## Validation before enabling live checkout

- Test initial purchase, confirmed renewal, failed renewal, cancellation, repeated and out-of-order webhooks, partial/full refunds, pack stacking and retained pack access after subscription expiry.
- Check real Indian recurring mandate authorization/collection separately from other supported payment methods.
- Verify advertised tax-inclusive/local-currency totals, portal restrictions, webhook retry delivery and deletion with a cancelling/failing subscription.
- Measure full voice and Lesson generation costs before enabling unlimited daily Lesson access broadly. Gross Pro revenue is $0.06 per included live minute before tax, payment fees, text generation, hosting and other costs; margin is not established by local tests.

Local automated tests use a disposable migrated database and a fake Dodo HTTP transport. They do not charge cards or verify merchant approval, live credentials, dashboard settings, provider prices or legal adequacy of the published policy copy.
