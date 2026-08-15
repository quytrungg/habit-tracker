import { createHash, randomBytes } from "node:crypto";

import { compare, hash, hashSync } from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";

import * as schema from "@/db/schema";
import {
  loginInputSchema,
  registerInputSchema,
  updateSettingsInputSchema,
} from "@/domain/schemas";

import { ServiceError } from "./errors";
import type { HabitDatabase } from "./habit-service";

const SESSION_DAYS = 30;
const DUMMY_PASSWORD_HASH = hashSync("dummy-password-for-timing", 10);

const publicUser = (user: schema.UserRow) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  timezone: user.timezone,
});

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function validTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function databaseErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String(error.code)
    : null;
}

export async function registerUser(database: HabitDatabase, untrustedInput: unknown) {
  const parsed = registerInputSchema.safeParse(untrustedInput);
  if (!parsed.success || !validTimeZone(parsed.data?.timezone ?? "")) {
    throw new ServiceError("VALIDATION_ERROR", "Account details are invalid", {
      details: parsed.success ? { timezone: "Unknown timezone" } : parsed.error.flatten(),
    });
  }
  const input = parsed.data;
  const passwordHash = await hash(input.password, 10);

  try {
    const [user] = await database
      .insert(schema.users)
      .values({
        email: input.email,
        displayName: input.displayName,
        passwordHash,
        timezone: input.timezone,
      })
      .returning();
    return publicUser(user);
  } catch (error) {
    if (databaseErrorCode(error) === "23505") {
      throw new ServiceError("CONFLICT", "An account already uses this email");
    }
    throw error;
  }
}

export async function authenticateUser(
  database: HabitDatabase,
  untrustedInput: unknown,
) {
  const parsed = loginInputSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new ServiceError("UNAUTHENTICATED", "Email or password is incorrect");
  }

  const [user] = await database
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, parsed.data.email))
    .limit(1);
  const matches = await compare(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !matches) {
    throw new ServiceError("UNAUTHENTICATED", "Email or password is incorrect");
  }
  return publicUser(user);
}

export async function createSession(
  database: HabitDatabase,
  userId: string,
  now = new Date(),
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + SESSION_DAYS);

  await database.insert(schema.authSessions).values({
    userId,
    tokenHash: tokenHash(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function getUserBySessionToken(
  database: HabitDatabase,
  token: string,
  now = new Date(),
) {
  if (!token) return null;
  const [result] = await database
    .select({ user: schema.users })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.authSessions.userId))
    .where(
      and(
        eq(schema.authSessions.tokenHash, tokenHash(token)),
        gt(schema.authSessions.expiresAt, now),
      ),
    )
    .limit(1);
  return result ? publicUser(result.user) : null;
}

export async function deleteSession(database: HabitDatabase, token: string) {
  if (!token) return;
  await database
    .delete(schema.authSessions)
    .where(eq(schema.authSessions.tokenHash, tokenHash(token)));
}

export async function updateUserSettings(
  database: HabitDatabase,
  userId: string,
  untrustedInput: unknown,
) {
  const parsed = updateSettingsInputSchema.safeParse(untrustedInput);
  if (
    !parsed.success ||
    (parsed.data.timezone !== undefined && !validTimeZone(parsed.data.timezone))
  ) {
    throw new ServiceError("VALIDATION_ERROR", "Settings are invalid", {
      details: parsed.success ? { timezone: "Unknown timezone" } : parsed.error.flatten(),
    });
  }
  const [user] = await database
    .update(schema.users)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .returning();
  if (!user) throw new ServiceError("NOT_FOUND", "Account was not found");
  return publicUser(user);
}
