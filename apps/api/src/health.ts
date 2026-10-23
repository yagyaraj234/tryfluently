import type { Db } from "@fluently/db";
import { sql } from "drizzle-orm";
import { Hono } from "hono";

export function health(db: Db) {
  let checking: Promise<void> | undefined;
  function probe() {
    let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    const work = db.transaction(async (tx) => {
      if (expired) return;
      // Keep the server deadline inside the response budget; LOCAL cannot affect a later learner query.
      await tx.execute(sql`set local statement_timeout = '1500ms'`);
      if (!expired) await tx.execute(sql`select 1`);
    });
    return Promise.race([
      work,
      new Promise<void>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error("Database readiness timed out"));
        }, 2_000);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  return new Hono()
    .get("/live", (c) => c.json({ status: "alive" }))
    .get("/ready", async (c) => {
      try {
        // Share the response deadline too, so a stuck connection cannot poison all later probes.
        checking ??= probe().finally(() => {
          checking = undefined;
        });
        await checking;
        return c.json({ status: "ready" });
      } catch {
        return c.json({ status: "unavailable" }, 503);
      }
    });
}
