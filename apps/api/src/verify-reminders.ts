import { schema } from "@fluently/db";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { createEmailVerificationToken } from "better-auth/api";
import type { Deps } from "./app";
import { verifyReminderEmail } from "./mailer";
import { unsubscribeUrl } from "./streak-reminders";

const { user } = schema;
const HOUR = 3_600_000;

/** Once, 24 hours after sign-up, emails each Learner who still hasn't verified their email. */
export async function sendVerifyReminders(deps: Deps) {
  const { db, mailer, env } = deps;
  const at = deps.now();
  const unverified = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(
      and(
        eq(user.emailVerified, false),
        eq(user.verifyReminders, true),
        isNull(user.verifyRemindedAt),
        lte(user.createdAt, new Date(at.getTime() - 24 * HOUR)),
        // shortcut: skip sign-ups older than 72h; widen if sweeps can be down longer.
        gte(user.createdAt, new Date(at.getTime() - 72 * HOUR)),
      ),
    );
  for (const learner of unverified) {
    // Claim first so overlapping sweeps send once; a failed send releases the claim for the next sweep.
    const [claimed] = await db
      .update(user)
      .set({ verifyRemindedAt: at })
      .where(
        and(
          eq(user.id, learner.id),
          eq(user.emailVerified, false),
          eq(user.verifyReminders, true),
          isNull(user.verifyRemindedAt),
        ),
      )
      .returning({ id: user.id });
    if (!claimed) continue;
    try {
      // Better Auth's own links last an hour, so this one is minted to last a week.
      const token = await createEmailVerificationToken(env.BETTER_AUTH_SECRET, learner.email, undefined, 7 * 24 * 3600);
      const url = `${env.BETTER_AUTH_URL}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent("/home")}`;
      await mailer.send(
        verifyReminderEmail(learner.email, url, unsubscribeUrl(env, learner.id, "verify")),
        `verify-reminder/${learner.id}`,
      );
    } catch (error) {
      await db.update(user).set({ verifyRemindedAt: null }).where(eq(user.id, learner.id));
      console.error("Verify reminder failed", error);
    }
  }
}

export function startVerifyReminders(deps: Deps) {
  let running: Promise<void> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || running) return;
    running = sendVerifyReminders(deps)
      .catch((error) => console.error("Verify reminders failed", error))
      .finally(() => {
        running = undefined;
      });
  };
  const timer = setInterval(() => void tick(), 5 * 60_000);
  timer.unref();
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await running;
  };
}
