import { format, subDays } from "date-fns";
import { notFound } from "next/navigation";

import { HabitDetail } from "@/components/habits/habit-detail";
import { db } from "@/db";
import { todayInTimeZone } from "@/domain/habit-engine";
import { requireUser } from "@/server/auth/session";
import { getDashboard } from "@/server/services/habit-service";

export default async function HabitDetailPage({
  params,
}: {
  params: Promise<{ habitId: string }>;
}) {
  const user = await requireUser();
  const { habitId } = await params;
  const today = todayInTimeZone(user.timezone);
  const from = format(subDays(new Date(`${today}T12:00:00`), 364), "yyyy-MM-dd");
  const data = await getDashboard(db, { userId: user.id, from, to: today, today });
  const item = data.habits.find((candidate) => candidate.habit.id === habitId);
  if (!item) notFound();
  return <HabitDetail item={item} today={today} />;
}
