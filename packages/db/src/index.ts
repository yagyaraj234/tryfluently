import { drizzle } from "drizzle-orm/postgres-js";
import { migrate as runMigrations } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema";

export * as schema from "./schema";

export function createDb(url: string) {
  return drizzle({ client: postgres(url, { onnotice: () => {} }), schema, casing: "snake_case" });
}
export type Db = ReturnType<typeof createDb>;

export const migrate = (db: Db) =>
  runMigrations(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
// A transaction works anywhere the db does.
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;
export type { CefrLevel, Skill } from "./schema";
