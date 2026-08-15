import { db } from "@/db";
import { apiError, requestJson } from "@/server/http/api-response";
import { requireUser } from "@/server/auth/session";
import { updateHabit } from "@/server/services/habit-service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ habitId: string }> },
) {
  try {
    const user = await requireUser();
    const { habitId } = await params;
    const habit = await updateHabit(
      db,
      user.id,
      habitId,
      await requestJson(request),
    );
    return Response.json({ habit });
  } catch (error) {
    return apiError(error);
  }
}
