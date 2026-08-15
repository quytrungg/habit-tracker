import { db } from "@/db";
import { apiError, requestJson } from "@/server/http/api-response";
import { requireUser } from "@/server/auth/session";
import { createTargetVersion } from "@/server/services/habit-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ habitId: string }> },
) {
  try {
    const user = await requireUser();
    const { habitId } = await params;
    const result = await createTargetVersion(db, {
      userId: user.id,
      habitId,
      input: await requestJson(request),
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
