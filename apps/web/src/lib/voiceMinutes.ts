import { useEffect, useState } from "react";

/** The API owns the renewal boundary; display it consistently during SSR and hydration. */
export function resetsOn(iso: string) {
  return (
    new Intl.DateTimeFormat("en", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(iso)) + " at 00:00 UTC"
  );
}

export function voiceTime(seconds: number) {
  const remaining = Math.max(0, Math.floor(seconds));
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
}

/**
 * Milliseconds of voice left now: the last poll's `remainingSeconds`, less the call time since then. The API's count
 * already includes a live call up to the poll, so only the time after both the poll and the call going live counts.
 */
export function minutesLeft(
  poll: { remainingSeconds: number; fetchedAt: number; callEndsAt?: string | null },
  liveSince: number | undefined,
  now: number,
) {
  if (liveSince === undefined) return poll.remainingSeconds * 1000;
  const remaining = poll.remainingSeconds * 1000 - Math.max(0, now - Math.max(poll.fetchedAt, liveSince));
  return poll.callEndsAt ? Math.min(remaining, new Date(poll.callEndsAt).getTime() - now) : remaining;
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
