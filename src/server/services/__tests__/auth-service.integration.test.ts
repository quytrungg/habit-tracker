import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  authenticateUser,
  createSession,
  deleteSession,
  getUserBySessionToken,
  registerUser,
} from "@/server/services/auth-service";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required");

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const database = drizzle(sql, { schema });

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "./src/db/migrations" });
});

beforeEach(async () => {
  await sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`;
});

afterAll(async () => {
  await sql.end();
});

describe("authentication service", () => {
  it("registers a normalized account without storing the raw password", async () => {
    const user = await registerUser(database, {
      displayName: "  Mai  ",
      email: "MAI@EXAMPLE.COM",
      password: "correct-horse",
      timezone: "Asia/Ho_Chi_Minh",
    });

    expect(user).toMatchObject({
      displayName: "Mai",
      email: "mai@example.com",
      timezone: "Asia/Ho_Chi_Minh",
    });
    const [stored] = await database.select().from(schema.users);
    expect(stored.passwordHash).not.toContain("correct-horse");
  });

  it("authenticates valid credentials and rejects invalid credentials uniformly", async () => {
    await registerUser(database, {
      displayName: "Mai",
      email: "mai@example.com",
      password: "correct-horse",
      timezone: "UTC",
    });

    await expect(
      authenticateUser(database, {
        email: "mai@example.com",
        password: "correct-horse",
      }),
    ).resolves.toMatchObject({ email: "mai@example.com" });
    await expect(
      authenticateUser(database, {
        email: "mai@example.com",
        password: "wrong",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      authenticateUser(database, {
        email: "unknown@example.com",
        password: "wrong",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("resolves and revokes an opaque session token", async () => {
    const user = await registerUser(database, {
      displayName: "Mai",
      email: "mai@example.com",
      password: "correct-horse",
      timezone: "UTC",
    });
    const now = new Date("2026-08-14T10:00:00.000Z");
    const session = await createSession(database, user.id, now);

    await expect(
      getUserBySessionToken(database, session.token, now),
    ).resolves.toMatchObject({ id: user.id });
    await deleteSession(database, session.token);
    await expect(
      getUserBySessionToken(database, session.token, now),
    ).resolves.toBeNull();
  });

  it("does not resolve an expired session", async () => {
    const user = await registerUser(database, {
      displayName: "Mai",
      email: "mai@example.com",
      password: "correct-horse",
      timezone: "UTC",
    });
    const session = await createSession(
      database,
      user.id,
      new Date("2026-07-01T00:00:00.000Z"),
    );

    await expect(
      getUserBySessionToken(
        database,
        session.token,
        new Date("2026-08-14T00:00:00.000Z"),
      ),
    ).resolves.toBeNull();
  });
});
