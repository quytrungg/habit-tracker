import { db } from "@/db";
import { requestJson, apiError } from "@/server/http/api-response";
import { startUserSession } from "@/server/auth/session";
import { authenticateUser } from "@/server/services/auth-service";

export async function POST(request: Request) {
  try {
    const user = await authenticateUser(db, await requestJson(request));
    await startUserSession(user.id);
    return Response.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
