import { apiError } from "@/server/http/api-response";
import { endUserSession } from "@/server/auth/session";

export async function POST() {
  try {
    await endUserSession();
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
