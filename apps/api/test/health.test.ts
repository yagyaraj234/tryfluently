import { expect, mock, test } from "bun:test";
import type { Db } from "@fluently/db";
import { sql, type SQL } from "drizzle-orm";
import { health } from "../src/health";
import { makeApp } from "./helpers";
import { testDb } from "./setup";

function fakeDatabase(execute: () => Promise<unknown>, acquire = async () => {}) {
  const released = mock(() => {});
  const transaction = mock(async (run: (tx: Db) => Promise<void>) => {
    await acquire();
    try {
      await run(
        new Proxy(testDb, {
          get(target, key, receiver) {
            return key === "execute" ? execute : Reflect.get(target, key, receiver);
          },
        }),
      );
    } finally {
      released();
    }
  });
  return {
    transaction,
    released,
    db: new Proxy(testDb, {
      get(target, key, receiver) {
        return key === "transaction" ? transaction : Reflect.get(target, key, receiver);
      },
    }),
  };
}

test("health endpoints are public and readiness reaches the database", async () => {
  const app = makeApp();
  const live = await app.request("/health/live");
  expect(live.status).toBe(200);
  expect(await live.json()).toEqual({ status: "alive" });
  const ready = await app.request("/health/ready");
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({ status: "ready" });
});

test("the database cancels a slow probe and later readiness recovers after rollback", async () => {
  let statements = 0;
  let failure: unknown;
  const transaction: Db["transaction"] = (run, config) =>
    testDb.transaction(
      (tx) =>
        run(
          new Proxy(tx, {
            get(target, key, receiver) {
              if (key === "execute")
                return async (statement: SQL) => {
                  try {
                    // Keep SET LOCAL real, and delay only the first probe's SELECT.
                    return await tx.execute(++statements === 2 ? sql`select pg_sleep(5)` : statement);
                  } catch (error) {
                    failure = error;
                    throw error;
                  }
                };
              return Reflect.get(target, key, receiver);
            },
          }),
        ),
      config,
    );
  const app = health(
    new Proxy(testDb, {
      get(target, key, receiver) {
        return key === "transaction" ? transaction : Reflect.get(target, key, receiver);
      },
    }),
  );
  const at = performance.now();
  expect((await app.request("/ready")).status).toBe(503);
  expect(performance.now() - at).toBeLessThan(2_000);
  expect(failure).toMatchObject({ cause: { code: "57014" } });
  expect((await app.request("/ready")).status).toBe(200);
});

test("database failure fails readiness, preserves liveness and recovers without restart", async () => {
  let down = true;
  const execute = mock(async () => {
    if (down) throw new Error("private database connection details");
    return [];
  });
  const database = fakeDatabase(execute);
  const app = health(database.db);
  expect((await app.request("/live")).status).toBe(200);
  expect(execute).not.toHaveBeenCalled();
  const failed = await app.request("/ready");
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ status: "unavailable" });
  down = false;
  expect((await app.request("/ready")).status).toBe(200);
  expect(database.transaction).toHaveBeenCalledTimes(2);
  expect(database.released).toHaveBeenCalledTimes(2);
});

test("overlapping probes share a deadline, and a timed-out query cannot block fresh readiness", async () => {
  const blocked = Promise.withResolvers<unknown>();
  let calls = 0;
  const database = fakeDatabase(async () => (++calls === 2 ? blocked.promise : []));
  const app = health(database.db);
  try {
    const at = performance.now();
    const replies = await Promise.all([app.request("/ready"), app.request("/ready")]);
    expect(replies.map((r) => r.status)).toEqual([503, 503]);
    expect(performance.now() - at).toBeLessThan(3_000);
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(database.released).not.toHaveBeenCalled();
    expect((await app.request("/live")).status).toBe(200);
    expect((await app.request("/ready")).status).toBe(200);
    expect(database.transaction).toHaveBeenCalledTimes(2);
    expect(database.released).toHaveBeenCalledTimes(1);
  } finally {
    blocked.reject(new Error("stale database connection failed"));
    await Promise.resolve(database.transaction.mock.results[0]!.value).catch(() => {});
  }
  expect(database.released).toHaveBeenCalledTimes(2);
});

test("a connection acquired after the response deadline is released without running probe statements", async () => {
  const acquiring = Promise.withResolvers<void>();
  let attempts = 0;
  const execute = mock(async () => []);
  const database = fakeDatabase(execute, async () => {
    if (++attempts === 1) await acquiring.promise;
  });
  const app = health(database.db);
  try {
    expect((await app.request("/ready")).status).toBe(503);
    expect(execute).not.toHaveBeenCalled();
    expect((await app.request("/ready")).status).toBe(200);
    expect(execute).toHaveBeenCalledTimes(2);
  } finally {
    acquiring.resolve();
    await database.transaction.mock.results[0]!.value;
  }
  expect(execute).toHaveBeenCalledTimes(2);
  expect(database.released).toHaveBeenCalledTimes(2);
});
