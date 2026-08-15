import { db } from "@/db";
import { apiError, requestJson } from "@/server/http/api-response";
import { requireUser } from "@/server/auth/session";
import { createHabit } from "@/server/services/habit-service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const result = await createHabit(db, user.id, await requestJson(request));
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
