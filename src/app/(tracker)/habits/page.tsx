import { format, subDays } from "date-fns";

import { HabitDashboard } from "@/components/habits/habit-dashboard";
import { db } from "@/db";
import { todayInTimeZone } from "@/domain/habit-engine";
import { requireUser } from "@/server/auth/session";
import { getDashboard } from "@/server/services/habit-service";

export default async function HabitsPage() {
  const user = await requireUser();
  const today = todayInTimeZone(user.timezone);
  const from = format(subDays(new Date(`${today}T12:00:00`), 181), "yyyy-MM-dd");
  const data = await getDashboard(db, { userId: user.id, from, to: today, today });

  return (
    <HabitDashboard
      from={from}
      initialData={data}
      today={today}
      userName={user.displayName.split(" ")[0]}
    />
  );
}
