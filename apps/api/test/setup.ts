import { createDb, migrate } from "@impromptu/db";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://impromptu:impromptu@localhost:5433/impromptu_test";

export const testDb = createDb(TEST_DATABASE_URL);
await migrate(testDb);
