"use client";

import { Flame, LayoutGrid, List, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { targetForDate } from "@/domain/habit-engine";
import type { CheckpointAward } from "@/domain/types";
import type { DashboardHabit } from "@/server/services/habit-service";
import { CheckInDrawer } from "@/components/check-in/check-in-drawer";

import { HabitCard } from "./habit-card";
import { HabitForm } from "./habit-form";

type DashboardData = { habits: DashboardHabit[] };
type AwardResult = Pick<
  CheckpointAward,
  "id" | "checkpointId" | "progressSnapshot"
>[];

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

  const refresh = async () => {
    const response = await fetch(`/api/dashboard?from=${from}&to=${today}`);
    const result = (await response.json()) as DashboardData & {
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(result.error?.message ?? "Could not refresh habits");
    setData(result);
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

  const afterMutation = async (awards: AwardResult) => {
    try {
      await refresh();
      celebrate(awards);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh habits");
    }
  };

  const primaryAction = async (item: DashboardHabit) => {
    const target = targetForDate(item.targets, today);
    if (!target || target.metric !== "binary" || item.todayValue >= target.targetValue) {
      setSelected({ habitId: item.habit.id, date: today });
      return;
    }

    setSavingHabitId(item.habit.id);
    setMessage(null);
    const previous = data;
    setData({
      habits: data.habits.map((candidate) =>
        candidate.habit.id === item.habit.id
          ? { ...candidate, todayValue: 1 }
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
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(result.error?.message ?? "Check-in failed");
      await afterMutation(result.newAwards ?? []);
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
          <span aria-hidden="true" className="view-flame">
            <Flame fill="currentColor" />
          </span>
        </div>
        <div className="dashboard-title">
          <p>Good to see you, {userName}</p>
          <h1>Habits</h1>
        </div>
        <button
          aria-label="Create a new habit"
          className="add-habit-button"
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          <Plus aria-hidden="true" />
        </button>
      </header>

      {message ? (
        <div className="inline-alert" role="alert">
          <span>{message}</span>
          <button aria-label="Dismiss error" onClick={() => setMessage(null)} type="button">
            <X aria-hidden="true" size={17} />
          </button>
        </div>
      ) : null}

      {data.habits.length ? (
        <div className="habit-list" data-view={view} aria-busy={Boolean(savingHabitId)}>
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
      ) : (
        <section className="empty-habits">
          <div className="empty-embers" aria-hidden="true">
            <Sparkles />
          </div>
          <p className="eyebrow">A BLANK CALENDAR</p>
          <h2>Start with one small promise.</h2>
          <p>
            Choose something worth returning to. You can shape its target, rhythm, and
            first reward in under a minute.
          </p>
          <button className="primary-button" onClick={() => setCreateOpen(true)} type="button">
            <Plus aria-hidden="true" size={18} /> Create your first habit
          </button>
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
