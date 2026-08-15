import { db } from "@/db";
import { apiError } from "@/server/http/api-response";
import { requireUser } from "@/server/auth/session";
import { deleteCheckpoint } from "@/server/services/habit-service";

export async function DELETE(
  _: Request,
  {
    params,
  }: { params: Promise<{ habitId: string; checkpointId: string }> },
) {
  try {
    const user = await requireUser();
    const { habitId, checkpointId } = await params;
    await deleteCheckpoint(db, user.id, habitId, checkpointId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
