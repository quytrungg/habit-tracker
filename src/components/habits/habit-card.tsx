"use client";

import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { Check, Flame, Gift, PencilLine } from "lucide-react";
import Link from "next/link";

import { targetForDate } from "@/domain/habit-engine";
import type { DashboardHabit } from "@/server/services/habit-service";
import { HabitHeatmap } from "@/components/heatmap/habit-heatmap";

export function HabitCard({
  item,
  today,
  onPrimaryAction,
  onSelectDate,
}: {
  item: DashboardHabit;
  today: string;
  onPrimaryAction: () => void;
  onSelectDate: (date: string) => void;
}) {
  const target = targetForDate(item.targets, today);
  const elapsed =
    differenceInCalendarDays(
      parseISO(`${today}T12:00:00`),
      parseISO(`${item.habit.startDate}T12:00:00`),
    ) + 1;
  const isComplete = target ? item.todayValue >= target.targetValue : false;
  const progressText = target
    ? target.metric === "binary"
      ? isComplete
        ? "Checked in"
        : "Not checked in"
      : `${item.todayValue} / ${target.targetValue} ${target.unit ?? ""}`.trim()
    : "No active target";
  const actionLabel =
    target?.metric === "binary" && !isComplete
      ? `Check in ${item.habit.name}`
      : `Update ${item.habit.name}`;
  const checkpoint = item.nextCheckpoint;
  const checkpointPercent = checkpoint
    ? Math.min(100, (checkpoint.progress / checkpoint.thresholdValue) * 100)
    : 0;

  return (
    <article className="habit-card" data-accent={item.habit.accentToken}>
      <header className="habit-card-header">
        <Link className="habit-heading-link" href={`/habits/${item.habit.id}`}>
          <span className="habit-icon" aria-hidden="true">
            {item.habit.icon}
          </span>
          <span>
            <h2>{item.habit.name}</h2>
            <small>
              {format(parseISO(`${item.habit.startDate}T12:00:00`), "MMM d, yyyy")} · D+
              {Math.max(1, elapsed)}
            </small>
          </span>
        </Link>
        <span
          aria-label={`Current streak: ${item.stats.currentStreak} ${item.stats.streakUnit}`}
          className="streak-pill"
        >
          <Flame aria-hidden="true" fill="currentColor" size={16} />
          {item.stats.currentStreak}
        </span>
      </header>

      {item.habit.description ? (
        <p className="habit-description">{item.habit.description}</p>
      ) : null}

      <div className="card-heatmap">
        <HabitHeatmap cells={item.heatmap} onSelectDate={onSelectDate} />
      </div>

      {checkpoint ? (
        <div className="checkpoint-progress">
          <div>
            <span>
              <Gift aria-hidden="true" size={15} /> {checkpoint.title}
            </span>
            <small>
              {checkpoint.progress} / {checkpoint.thresholdValue} · {checkpoint.rewardDescription}
            </small>
          </div>
          <div className="checkpoint-track" aria-hidden="true">
            <span style={{ width: `${checkpointPercent}%` }} />
          </div>
        </div>
      ) : null}

      <button
        aria-label={actionLabel}
        className="habit-checkin-button"
        data-complete={isComplete}
        onClick={onPrimaryAction}
        type="button"
      >
        <span className="checkin-button-icon">
          {isComplete ? <Check aria-hidden="true" /> : <PencilLine aria-hidden="true" />}
        </span>
        <span>{progressText}</span>
      </button>
    </article>
  );
}
