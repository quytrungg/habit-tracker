"use client";

import { Droplets, LayoutGrid, List, Plus, Sparkles, X, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { baseXpForTarget, isScheduled, targetForDate } from "@/domain/habit-engine";
import type { CheckpointAward } from "@/domain/types";
import type { DashboardHabit, XpHistoryPoint } from "@/server/services/habit-service";
import { CheckInDrawer } from "@/components/check-in/check-in-drawer";
import type { CheckinSaveResult } from "@/components/check-in/check-in-drawer";
import { HabitHeatmap } from "@/components/heatmap/habit-heatmap";

import { HabitCard } from "./habit-card";
import { habitAccentStyle } from "./accent-style";
import { HabitForm } from "./habit-form";

type DashboardData = {
  habits: DashboardHabit[];
  archivedHabits?: DashboardHabit[];
  totalXp: number;
  xpHistory: XpHistoryPoint[];
};
type AwardResult = Pick<CheckpointAward, "id" | "checkpointId" | "progressSnapshot">[];

const plans = [
  {
    id: "focus",
    name: "Focus",
    price: "$4.99",
    description: "A calmer, more focused daily rhythm.",
    features: ["Unlimited habits", "Extended XP history"],
  },
  {
    id: "momentum",
    name: "Momentum",
    price: "$9.99",
    description: "More room to build habits that stick.",
    features: ["Everything in Focus", "Advanced rewards"],
  },
] as const;

export function HabitDashboard({
  initialData,
  today,
  from,
  userName,
}: {
  initialData: DashboardData;
  today: string;
  from: string;
  userName: string;
}) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<"list" | "grid">("list");
  const [habitStatus, setHabitStatus] = useState<"active" | "archived">("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<{ habitId: string; date: string } | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [reward, setReward] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [savingHabitId, setSavingHabitId] = useState<string | null>(null);
  const [xpGain, setXpGain] = useState<number | null>(null);
  const [confirmingHabit, setConfirmingHabit] = useState<DashboardHabit | null>(null);
  const [flowOpen, setFlowOpen] = useState(false);
  const [plansOpen, setPlansOpen] = useState(false);

  const refresh = async () => {
    const response = await fetch(`/api/dashboard?from=${from}&to=${today}`);
    const result = (await response.json()) as DashboardData & {
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(result.error?.message ?? "Could not refresh habits");
    setData(result);
  };

  const openCreateHabit = () => {
    if (data.habits.length >= 5) {
      setMessage("Free includes up to 5 active habits. Archive a habit or choose Boost to add more.");
      setPlansOpen(true);
      return;
    }
    setCreateOpen(true);
  };

  const celebrate = (awards: AwardResult) => {
    const first = awards[0];
    if (!first) return;
    for (const item of data.habits) {
      const checkpoint = item.checkpoints.find(
        (candidate) => candidate.id === first.checkpointId,
      );
      if (checkpoint) {
        setReward({
          title: checkpoint.title,
          description: checkpoint.rewardDescription,
        });
        break;
      }
    }
  };

  const afterMutation = async ({ awards, xpDelta }: CheckinSaveResult) => {
    try {
      await refresh();
      celebrate(awards);
      setXpGain(xpDelta > 0 ? xpDelta : null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh habits");
    }
  };

  const primaryAction = (item: DashboardHabit) => {
    const target = targetForDate(item.targets, today);
    if (
      target?.cadence === "hourly" &&
      !isScheduled(target, today, new Date().getHours())
    ) {
      setMessage("This habit is not scheduled for the current hour.");
      return;
    }
    if (
      !target ||
      target.metric !== "binary" ||
      (target.cadence !== "hourly" && item.todayValue >= target.targetValue)
    ) {
      setSelected({ habitId: item.habit.id, date: today });
      return;
    }

    setConfirmingHabit(item);
  };

  const confirmBinaryCheckin = async () => {
    const item = confirmingHabit;
    if (!item) return;
    setConfirmingHabit(null);

    setSavingHabitId(item.habit.id);
    setMessage(null);
    const previous = data;
    setData({
      totalXp: data.totalXp,
      xpHistory: data.xpHistory,
      habits: data.habits.map((candidate) =>
        candidate.habit.id === item.habit.id
          ? { ...candidate, todayValue: candidate.todayValue + 1 }
          : candidate,
      ),
    });
    try {
      const response = await fetch(
        `/api/habits/${item.habit.id}/checkins/${today}`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ value: 1, isSkipped: false, note: null }),
        },
      );
      const result = (await response.json()) as {
        newAwards?: AwardResult;
        xpDelta?: number;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "Check-in failed");
      await afterMutation({ awards: result.newAwards ?? [], xpDelta: result.xpDelta ?? 0 });
    } catch (error) {
      setData(previous);
      setMessage(error instanceof Error ? error.message : "Check-in failed");
    } finally {
      setSavingHabitId(null);
    }
  };

  const selectedHabit = selected
    ? data.habits.find((item) => item.habit.id === selected.habitId)
    : null;
  const scheduledHabits = data.habits.filter((item) => {
    const target = targetForDate(item.targets, today);
    return Boolean(
      target &&
        isScheduled(
          target,
          today,
          target.cadence === "hourly" ? new Date().getHours() : undefined,
        ),
    );
  });
  const completedHabits = scheduledHabits.filter((item) => {
    const target = targetForDate(item.targets, today);
    return target ? item.todayValue >= target.targetValue : false;
  });
  const todayXp = data.xpHistory.find((point) => point.date === today)?.earnedXp ?? 0;
  const currentStreak = Math.max(0, ...data.habits.map((item) => item.stats.currentStreak));
  const archivedHabits = data.archivedHabits ?? [];

  return (
    <>
      <header className="dashboard-header">
        <div className="view-switch" aria-label="Dashboard view">
          <button
            aria-label="List view"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            type="button"
          >
            <List aria-hidden="true" />
          </button>
          <button
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            type="button"
          >
            <LayoutGrid aria-hidden="true" />
          </button>
          <button
            aria-expanded={flowOpen}
            aria-haspopup="dialog"
            aria-label="Open today’s flow"
            className="view-flow"
            onClick={() => setFlowOpen(true)}
            type="button"
          >
            <Droplets aria-hidden="true" fill="currentColor" />
          </button>
        </div>
        <div className="dashboard-title">
          <p>Good to see you, {userName}</p>
          <h1>Habits</h1>
          <div aria-label={`${data.totalXp} total experience points`} className="xp-total">
            <Sparkles aria-hidden="true" size={14} />
            <strong>{data.totalXp}</strong> XP
          </div>
        </div>
        <div className="dashboard-actions">
          <button className="boost-button" onClick={() => setPlansOpen(true)} type="button">
            <Zap aria-hidden="true" size={16} /> Boost
          </button>
          <button
            aria-label="Create a new habit"
            className="add-habit-button"
            onClick={openCreateHabit}
            type="button"
          >
            <Plus aria-hidden="true" />
          </button>
        </div>
      </header>

      <div aria-label="Habit status" className="habit-tabs" role="tablist">
        <button
          aria-controls="active-habits-panel"
          aria-selected={habitStatus === "active"}
          id="active-habits-tab"
          onClick={() => setHabitStatus("active")}
          role="tab"
          type="button"
        >
          Active <span>{data.habits.length}</span>
        </button>
        <button
          aria-controls="archived-habits-panel"
          aria-selected={habitStatus === "archived"}
          id="archived-habits-tab"
          onClick={() => setHabitStatus("archived")}
          role="tab"
          type="button"
        >
          Archived <span>{archivedHabits.length}</span>
        </button>
      </div>

      {message ? (
        <div className="inline-alert" role="alert">
          <span>{message}</span>
          <button aria-label="Dismiss error" onClick={() => setMessage(null)} type="button">
            <X aria-hidden="true" size={17} />
          </button>
        </div>
      ) : null}

      {xpGain ? <p className="xp-gain" role="status">+{xpGain} XP earned</p> : null}

      {habitStatus === "active" && data.habits.length ? (
        <div
          aria-busy={Boolean(savingHabitId)}
          aria-labelledby="active-habits-tab"
          className="habit-list"
          data-view={view}
          id="active-habits-panel"
          role="tabpanel"
        >
          {data.habits.map((item) => (
            <HabitCard
              item={item}
              key={item.habit.id}
              onPrimaryAction={() => primaryAction(item)}
              onSelectDate={(date) => setSelected({ habitId: item.habit.id, date })}
              today={today}
            />
          ))}
        </div>
      ) : habitStatus === "active" ? (
        <section
          aria-labelledby="active-habits-tab"
          className="empty-habits"
          id="active-habits-panel"
          role="tabpanel"
        >
          <div className="empty-embers" aria-hidden="true">
            <Sparkles />
          </div>
          <p className="eyebrow">A BLANK CALENDAR</p>
          <h2>Start with one small promise.</h2>
          <p>
            Choose something worth returning to. You can shape its target, rhythm, and
            first reward in under a minute.
          </p>
          <button className="primary-button" onClick={openCreateHabit} type="button">
            <Plus aria-hidden="true" size={18} /> Create your first habit
          </button>
        </section>
      ) : archivedHabits.length ? (
        <div
          aria-labelledby="archived-habits-tab"
          className="habit-list archived-habit-list"
          data-view={view}
          id="archived-habits-panel"
          role="tabpanel"
        >
          {archivedHabits.map((item) => <ArchivedHabitCard item={item} key={item.habit.id} />)}
        </div>
      ) : (
        <section
          aria-labelledby="archived-habits-tab"
          className="empty-habits archived-empty"
          id="archived-habits-panel"
          role="tabpanel"
        >
          <p className="eyebrow">NO ARCHIVED HABITS</p>
          <h2>Your past rhythms will appear here.</h2>
          <p>Archived habits remain visible as read-only history.</p>
        </section>
      )}

      <p className="sr-only" aria-live="polite">
        {savingHabitId ? "Saving check-in" : ""}
      </p>

      {createOpen ? (
        <HabitForm
          onClose={() => setCreateOpen(false)}
          onCreated={refresh}
          today={today}
        />
      ) : null}
      {selected && selectedHabit ? (
        <CheckInDrawer
          date={selected.date}
          habit={selectedHabit}
          onClose={() => setSelected(null)}
          onSaved={afterMutation}
        />
      ) : null}
      {flowOpen ? (
        <div className="modal-backdrop" onMouseDown={() => setFlowOpen(false)}>
          <section
            aria-labelledby="daily-flow-title"
            aria-modal="true"
            className="drawer compact-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">TODAY&apos;S FLOW</p>
                <h2 id="daily-flow-title">Your daily rhythm</h2>
              </div>
              <button aria-label="Close today’s flow" className="icon-button" onClick={() => setFlowOpen(false)} type="button">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="drawer-body">
              <p className="drawer-context">A quick read on the promises you&apos;re keeping today.</p>
              <div className="daily-flow-grid">
                <article><strong>{completedHabits.length} of {scheduledHabits.length}</strong><span>habits complete</span></article>
                <article><strong>{todayXp}</strong><span>XP earned today</span></article>
                <article><strong>{currentStreak}</strong><span>best active streak</span></article>
              </div>
            </div>
            <footer className="modal-actions"><button className="primary-button" onClick={() => setFlowOpen(false)} type="button">Keep going</button></footer>
          </section>
        </div>
      ) : null}
      {plansOpen ? (
        <div className="modal-backdrop" onMouseDown={() => setPlansOpen(false)}>
          <section
            aria-labelledby="boost-plans-title"
            aria-modal="true"
            className="drawer compact-dialog boost-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">BOOST YOUR RHYTHM</p>
                <h2 id="boost-plans-title">Choose a plan</h2>
              </div>
              <button aria-label="Close plans" className="icon-button" onClick={() => setPlansOpen(false)} type="button">
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="boost-plan-list">
              {plans.map((plan) => (
                <article className="boost-plan" key={plan.id}>
                  <div><h3>{plan.name}</h3><p>{plan.description}</p></div>
                  <strong>{plan.price}<small> / month</small></strong>
                  <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                  <Link className="primary-button" href={{ pathname: "/checkout", query: { plan: plan.id } }} onClick={() => setPlansOpen(false)}>
                    Continue to Stripe
                  </Link>
                </article>
              ))}
            </div>
            <p className="prototype-note">Prototype checkout — Stripe payment setup comes next.</p>
          </section>
        </div>
      ) : null}
      {confirmingHabit ? (
        <div className="modal-backdrop" onMouseDown={() => setConfirmingHabit(null)}>
          <section
            aria-labelledby="confirm-checkin-title"
            aria-modal="true"
            className="drawer compact-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="drawer-header">
              <div>
                <p className="eyebrow">TODAY&apos;S CHECK-IN</p>
                <h2 id="confirm-checkin-title">Mark {confirmingHabit.habit.name} as done?</h2>
              </div>
              <button
                aria-label="Close check-in confirmation"
                className="icon-button"
                onClick={() => setConfirmingHabit(null)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="drawer-body">
              <p className="drawer-context">
                {confirmingHabit.habit.icon} This will record today&apos;s completion and earn up to{" "}
                {baseXpForTarget(targetForDate(confirmingHabit.targets, today)!)} XP.
              </p>
            </div>
            <footer className="modal-actions">
              <button className="secondary-button" onClick={() => setConfirmingHabit(null)} type="button">
                Not yet
              </button>
              <button className="primary-button accent-button" onClick={confirmBinaryCheckin} type="button">
                Yes, mark as done
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {reward ? (
        <div className="reward-backdrop" role="presentation">
          <section aria-labelledby="reward-title" className="reward-celebration" role="dialog">
            <span className="reward-spark" aria-hidden="true">
              <Sparkles />
            </span>
            <p className="eyebrow">CHECKPOINT REACHED</p>
            <h2 id="reward-title">{reward.title}</h2>
            <p>{reward.description}</p>
            <button className="primary-button" onClick={() => setReward(null)} type="button">
              Keep going
            </button>
          </section>
        </div>
      ) : null}
    </>
  );
}

function ArchivedHabitCard({ item }: { item: DashboardHabit }) {
  return (
    <article
      aria-label={`${item.habit.name}, archived habit`}
      className="habit-card archived-habit-card"
      data-accent={item.habit.accentToken}
      style={habitAccentStyle(item.habit.customColor)}
    >
      <header className="habit-card-header">
        <div className="habit-heading-link">
          <span className="habit-icon" aria-hidden="true">
            {item.habit.icon}
          </span>
          <span>
            <h2>{item.habit.name}</h2>
            <small>Archived · read-only history</small>
          </span>
        </div>
        <span className="archived-pill">Archived</span>
      </header>
      {item.habit.description ? (
        <p className="habit-description">{item.habit.description}</p>
      ) : null}
      <div className="card-heatmap archived-heatmap">
        <HabitHeatmap cells={item.heatmap} />
      </div>
      <p className="archived-summary">
        {item.stats.completedPeriods} completed periods · {item.stats.totalValue} total progress
      </p>
    </article>
  );
}
