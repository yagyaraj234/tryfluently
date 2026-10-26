import type { Server } from "bun";
import type { Db } from "@fluently/db";
import type { AppType } from "./app";

export function installShutdown(
  server: Pick<Server<unknown>, "stop">,
  app: Pick<AppType, "shutdown" | "drain">,
  db: Db,
  stopWorkers: (() => Promise<void>)[],
  graceMs = 120_000,
) {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => {
      console.error("Shutdown grace period expired; forcing exit");
      void server.stop(true);
      void db.$client.end({ timeout: 0 });
      process.exit(1);
    }, graceMs);
    let failed = false;
    try {
      const calls = app.shutdown();
      const results = await Promise.allSettled([server.stop(), calls, ...stopWorkers.map((stop) => stop())]);
      // Handlers can retain AI work until their HTTP response finishes.
      await app.drain();
      for (const result of results) {
        if (result.status !== "rejected") continue;
        failed = true;
        console.error("Shutdown drain failed", result.reason);
      }
    } catch (error) {
      failed = true;
      console.error("Shutdown failed", error);
    } finally {
      try {
        await db.$client.end({ timeout: 5 });
      } catch (error) {
        failed = true;
        console.error("Database shutdown failed", error);
      }
      clearTimeout(deadline);
      process.exit(failed ? 1 : 0);
    }
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
