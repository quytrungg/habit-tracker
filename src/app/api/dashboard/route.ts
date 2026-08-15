import { format, subDays } from "date-fns";

import { db } from "@/db";
import { todayInTimeZone } from "@/domain/habit-engine";
import { apiError } from "@/server/http/api-response";
import { requireUser } from "@/server/auth/session";
import { getDashboard } from "@/server/services/habit-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const today = todayInTimeZone(user.timezone);
    const to = url.searchParams.get("to") ?? today;
    const from =
      url.searchParams.get("from") ?? format(subDays(new Date(`${to}T12:00:00`), 364), "yyyy-MM-dd");
    return Response.json(await getDashboard(db, { userId: user.id, from, to, today }));
  } catch (error) {
    return apiError(error);
  }
}
