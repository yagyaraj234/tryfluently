# Paid access and minute balances

Status: accepted, 31 October 2026.

## Decision

Dodo Payments owns hosted collection, recurring subscriptions, tax handling and invoices. Postgres owns Fluently's credit grants, spend reservations, daily Lesson allowance and Streak Recovery. Each successful payment grants minutes once, keyed by its provider payment ID. Signed webhook deliveries are deduplicated durably; payment/refund state is retrieved from Dodo before changing grants. Checkout redirects and mandate activation never grant access.

Free has 25 live minutes per UTC month and five new Lessons per local day. A $9 tax-inclusive monthly subscription grants 150 minutes for its paid service period. A $29 tax-inclusive one-time pack grants 500 non-expiring minutes. Monthly allowance is spent first. Pro features are unlocked by a valid paid subscription period or any positive purchased balance, including indefinitely when a pack remains unused. Pro has no daily Lesson count limit; existing provider-spend request limits still apply.

## Consequences

Refunds revoke benefits from the refunded payment without resetting other grants or usage. Paid-period expiry removes unused subscription minutes but preserves purchased balance. Account deletion cancels future charges; missing credentials leave a durable cancellation request that survives data deletion and retries when credentials return. Separate skipped-Lesson status preserves progression without fabricating completions, XP or streak activity; completing the remaining Lessons masters the Unit. Streak restorations are a separate record rather than fake Lesson completions.

Durable credit reservations prevent duplicate spend, while the existing voice broker still requires a single API instance for socket ownership and timers. Ungraceful process loss holds reservations until their deadline, then charges only persisted activity checkpoints and releases unconfirmed usage; durable provider teardown/recovery is not implemented by this decision. See [billing operations and validation](../billing.md).

Paid guards activate only when Dodo is configured. Unconfigured deployments preserve existing learning access. Daily quotas count actual Lesson starts; reset timestamps on those Lessons prevent timezone changes from creating extra allowance.
