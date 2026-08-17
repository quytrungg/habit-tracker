import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { closeDatabase, db } from "../src/db/connection";

const migrationsFolder = "./src/db/migrations";
const destructiveSql = /\b(?:drop\s+(?:table|schema|database)|truncate(?:\s+table)?|delete\s+from)\b|\balter\s+table\b[\s\S]*?\bdrop\s+column\b/i;

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

try {
  await assertMigrationsAreNonDestructive();
  await migrate(db, { migrationsFolder });
  console.log("Database migrations applied.");
} finally {
  await closeDatabase();
}
