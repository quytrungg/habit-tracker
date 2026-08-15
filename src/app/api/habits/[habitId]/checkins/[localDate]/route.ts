import { db } from "@/db";
import { apiError, requestJson } from "@/server/http/api-response";
import { requireUser } from "@/server/auth/session";
import {
  deleteCheckin,
  upsertCheckin,
} from "@/server/services/habit-service";

type RouteParams = { params: Promise<{ habitId: string; localDate: string }> };

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { habitId, localDate } = await params;
    const result = await upsertCheckin(db, {
      userId: user.id,
      habitId,
      localDate,
      input: await requestJson(request),
    });
    return Response.json(result);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { habitId, localDate } = await params;
    await deleteCheckin(db, user.id, habitId, localDate);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
