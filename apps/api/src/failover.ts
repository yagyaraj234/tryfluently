import type { Provider, Realtime } from "./realtime";

const TRIPPED_MS = 5 * 60_000;

// Both providers behind one Realtime (ADR 0005). A call starts on the primary and moves to the other when the
// primary fails. A provider that just failed goes last for five minutes, so new calls don't each wait on it; a
// resumed call goes last on the provider it dropped from.
// shortcut: the breaker lives in memory, per API instance.
export function failover(providers: Record<Provider, Realtime>, primary: Provider, now = Date.now): Realtime {
  const trippedAt = new Map<Provider, number>();
  const owner = new Map<string, Provider>();
  const trip = (p: Provider) => trippedAt.set(p, now());
  const order = (avoid?: Provider) => {
    const rank = (p: Provider) => (p === avoid ? 2 : now() - (trippedAt.get(p) ?? -Infinity) < TRIPPED_MS ? 1 : 0);
    return (primary === "openai" ? (["openai", "rime"] as const) : (["rime", "openai"] as const))
      .slice()
      .sort((a, b) => rank(a) - rank(b));
  };

  return {
    async createCall(sdp, session, avoid) {
      let error: unknown;
      for (const p of order(avoid)) {
        try {
          const call = await providers[p].createCall(sdp, session);
          owner.set(call.callId, p);
          return call;
        } catch (e) {
          console.error(`realtime ${p} failed to start a call`, e);
          trip(p);
          error = e;
        }
      }
      throw error;
    },
    attach(callId, { onEvent, onClose }) {
      const p = owner.get(callId)!;
      // ponytail: only Rime reports a failed close; OpenAI's sideband close codes aren't classified yet.
      const sideband = providers[p].attach(callId, {
        onEvent,
        onClose(failed) {
          owner.delete(callId);
          if (failed) trip(p);
          return onClose(failed);
        },
      });
      return {
        send: sideband.send,
        async hangup() {
          await sideband.hangup();
          owner.delete(callId);
        },
      };
    },
    join(callId, browser) {
      const p = owner.get(callId);
      return p && providers[p].join?.(callId, browser);
    },
  };
}
