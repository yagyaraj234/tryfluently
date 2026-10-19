import { useEffect, useState } from "react";

// Today's Roleplay voice minutes: the API caps them per day and resets them at the Learner's local midnight.

/** When today's voice minutes come back: "in 5 hours", or under an hour "in 50 minutes". */
export function resetsIn(now: Date) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const ms = midnight.getTime() - now.getTime();
  const format = new Intl.RelativeTimeFormat("en");
  return ms >= 3_600_000
    ? format.format(Math.floor(ms / 3_600_000), "hour")
    : format.format(Math.ceil(ms / 60_000), "minute");
}

/**
 * Milliseconds of voice left now: the last poll's `remainingSeconds`, less the call time since then. The API's count
 * already includes a live call up to the poll, so only the time after both the poll and the call going live counts.
 */
export function minutesLeft(
  poll: { remainingSeconds: number; fetchedAt: number },
  liveSince: number | undefined,
  now: number,
) {
  if (liveSince === undefined) return poll.remainingSeconds * 1000;
  return poll.remainingSeconds * 1000 - Math.max(0, now - Math.max(poll.fetchedAt, liveSince));
}

/** When the call went live, and the time now, ticking each second while it's live. */
export function useCallClock(live: boolean) {
  const [since, setSince] = useState<number>();
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!live) return;
    const tick = () => setNow(Date.now());
    tick();
    setSince((s) => s ?? Date.now());
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [live]);
  return { since, now };
}
