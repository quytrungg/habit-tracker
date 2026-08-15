import { db } from "@/db";
import { apiError, requestJson } from "@/server/http/api-response";
import { requireUser } from "@/server/auth/session";
import { updateUserSettings } from "@/server/services/auth-service";

export async function PATCH(request: Request) {
  try {
    const currentUser = await requireUser();
    const user = await updateUserSettings(
      db,
      currentUser.id,
      await requestJson(request),
    );
    return Response.json({ user });
  } catch (error) {
    return apiError(error);
  }
}
