import { format, subDays } from "date-fns";
import { Check, Gift, LockKeyhole } from "lucide-react";

import { db } from "@/db";
import { todayInTimeZone } from "@/domain/habit-engine";
import { requireUser } from "@/server/auth/session";
import { getDashboard } from "@/server/services/habit-service";

export default async function RewardsPage() {
  const user = await requireUser();
  const today = todayInTimeZone(user.timezone);
  const from = format(subDays(new Date(`${today}T12:00:00`), 364), "yyyy-MM-dd");
  const data = await getDashboard(db, { userId: user.id, from, to: today, today });
  const rewards = data.habits.flatMap((item) =>
    item.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      habitName: item.habit.name,
      habitIcon: item.habit.icon,
      accentToken: item.habit.accentToken,
    })),
  );
  const earned = rewards.filter((reward) => reward.isEarned);
  const upcoming = rewards.filter((reward) => !reward.isEarned);

  return (
    <section className="content-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">MOMENTS THAT MATTER</p>
          <h1>Rewards</h1>
          <p>Promises you made to your future self.</p>
        </div>
        <span className="page-stat"><Gift /> {earned.length} earned</span>
      </header>

      <h2 className="section-title">Up next</h2>
      <div className="reward-grid">
        {upcoming.length ? upcoming.map((reward) => (
          <article className="reward-card" data-accent={reward.accentToken} key={reward.id}>
            <LockKeyhole aria-hidden="true" />
            <div>
              <small>{reward.habitIcon} {reward.habitName}</small>
              <h3>{reward.title}</h3>
              <p>{reward.rewardDescription}</p>
              <div className="reward-progress"><span style={{ width: `${Math.min(100, reward.progress / reward.thresholdValue * 100)}%` }} /></div>
              <small>{reward.progress} / {reward.thresholdValue}</small>
            </div>
          </article>
        )) : <p className="page-empty">Add a checkpoint to a habit to see an upcoming reward.</p>}
      </div>

      <h2 className="section-title">Earned</h2>
      <div className="reward-grid">
        {earned.length ? earned.map((reward) => (
          <article className="reward-card earned" data-accent={reward.accentToken} key={reward.id}>
            <Check aria-hidden="true" />
            <div>
              <small>{reward.habitIcon} {reward.habitName}</small>
              <h3>{reward.title}</h3>
              <p>{reward.rewardDescription}</p>
              <small>{reward.earnedAt ? `Earned ${format(new Date(reward.earnedAt), "MMM d, yyyy")}` : "Earned"}</small>
            </div>
          </article>
        )) : <p className="page-empty">Your first earned reward will appear here.</p>}
      </div>
    </section>
  );
}
