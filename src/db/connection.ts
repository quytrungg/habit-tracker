import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const globalDatabase = globalThis as typeof globalThis & {
  habitTrackerSql?: ReturnType<typeof postgres>;
};

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env.local and run the migrations.",
    );
  }
  return value;
}

const client =
  globalDatabase.habitTrackerSql ??
  postgres(databaseUrl(), {
    max: process.env.NODE_ENV === "test" ? 2 : 10,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalDatabase.habitTrackerSql = client;

export const db = drizzle(client, { schema });
export type Database = typeof db;

export async function closeDatabase() {
  await client.end();
  if (globalDatabase.habitTrackerSql === client) {
    delete globalDatabase.habitTrackerSql;
  }
}
