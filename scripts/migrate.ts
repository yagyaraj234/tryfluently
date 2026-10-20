import { createDb, migrate } from "../packages/db/src";

if (!process.env.DATABASE_URL) throw new Error("Missing env var DATABASE_URL");
const db = createDb(process.env.DATABASE_URL);
try {
  await migrate(db);
} finally {
  await db.$client.end();
}
