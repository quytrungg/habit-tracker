import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeDatabase, db } from "../src/db/connection";

await migrate(db, { migrationsFolder: "./src/db/migrations" });
console.log("Database migrations applied.");
await closeDatabase();
