import { db } from "@/db";
import { requestJson, apiError } from "@/server/http/api-response";
import { startUserSession } from "@/server/auth/session";
import { registerUser } from "@/server/services/auth-service";

export async function POST(request: Request) {
  try {
    const user = await registerUser(db, await requestJson(request));
    await startUserSession(user.id);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
