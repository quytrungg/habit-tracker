import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { closeDatabase, db } from "../src/db/connection";

const migrationsFolder = "./src/db/migrations";
const journalPath = `${migrationsFolder}/meta/_journal.json`;
const destructiveSql = /\b(?:drop\s+(?:table|schema|database)|truncate(?:\s+table)?|delete\s+from)\b|\balter\s+table\b[\s\S]*?\bdrop\s+column\b/i;

type MigrationJournal = {
  entries: Array<{ idx: number; tag: string; when: number }>;
};

async function assertMigrationsAreNonDestructive() {
  const migrationFiles = (await readdir(migrationsFolder))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrationFiles) {
    const contents = await readFile(join(migrationsFolder, file), "utf8");
    if (destructiveSql.test(contents)) {
      throw new Error(
        `Refusing to run destructive migration ${file}. Run destructive database changes through a reviewed manual operation instead.`,
      );
    }
  }
}

async function baselineVerifiedLegacySchema() {
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as MigrationJournal;
  const initialMigration = journal.entries.find(({ idx }) => idx === 0);
  if (!initialMigration) throw new Error("Initial migration is missing from the journal");

  const initialSql = await readFile(
    join(migrationsFolder, `${initialMigration.tag}.sql`),
    "utf8",
  );
  const hash = createHash("sha256").update(initialSql).digest("hex");

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
  await db.execute(sql`
    INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
    SELECT ${hash}, ${initialMigration.when}
    WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations")
      AND to_regclass('public.users') IS NOT NULL
      AND to_regclass('public.auth_sessions') IS NOT NULL
      AND to_regclass('public.habits') IS NOT NULL
      AND to_regclass('public.habit_targets') IS NOT NULL
      AND to_regclass('public.habit_checkins') IS NOT NULL
      AND to_regclass('public.habit_checkpoints') IS NOT NULL
      AND to_regclass('public.checkpoint_awards') IS NOT NULL
      AND to_regtype('public.accent_token') IS NOT NULL
      AND to_regtype('public.habit_cadence') IS NOT NULL
  `);
}

try {
  await assertMigrationsAreNonDestructive();
  await baselineVerifiedLegacySchema();
  await migrate(db, { migrationsFolder });
  console.log("Database migrations applied.");
} finally {
  await closeDatabase();
}
