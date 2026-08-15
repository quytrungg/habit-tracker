import "server-only";

import { cookies } from "next/headers";

import { db } from "@/db";
import {
  createSession,
  deleteSession,
  getUserBySessionToken,
} from "@/server/services/auth-service";
import { ServiceError } from "@/server/services/errors";

const cookieName = () => process.env.SESSION_COOKIE_NAME ?? "habit_session";

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  return token ? getUserBySessionToken(db, token) : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue");
  return user;
}

export async function startUserSession(userId: string) {
  const session = await createSession(db, userId);
  const store = await cookies();
  store.set(cookieName(), session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: session.expiresAt,
  });
}

export async function endUserSession() {
  const store = await cookies();
  const token = store.get(cookieName())?.value;
  if (token) await deleteSession(db, token);
  store.set(cookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}
