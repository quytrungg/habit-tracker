import { describe, expect, it } from "vitest";

import {
  buildHeatmap,
  baseXpForTarget,
  calculateHabitXp,
  calculateHabitStats,
  evaluateCheckpoint,
  progressForTargetPeriod,
  targetForDate,
} from "@/domain/habit-engine";
import type {
  Checkin,
  Checkpoint,
  HabitTarget,
} from "@/domain/types";

const dailyTarget: HabitTarget = {
  id: "target-daily",
  habitId: "habit-1",
  metric: "count",
  targetValue: 8,
  unit: "glasses",
  cadence: "daily",
  scheduledWeekdays: null,
  effectiveFrom: "2026-08-01",
  effectiveTo: null,
};

const entry = (
  date: string,
  value: number,
  overrides: Partial<Checkin> = {},
): Checkin => ({
  id: `entry-${date}`,
  habitId: "habit-1",
  targetId: "target-daily",
  localDate: date,
  value,
  isSkipped: false,
  note: null,
  ...overrides,
});

describe("targetForDate", () => {
  it("uses the version effective on the historical local date", () => {
    const oldTarget = {
      ...dailyTarget,
      id: "old",
      targetValue: 4,
      effectiveTo: "2026-08-09",
    };
    const newTarget = {
      ...dailyTarget,
      id: "new",
      effectiveFrom: "2026-08-10",
    };

    expect(targetForDate([oldTarget, newTarget], "2026-08-09")?.id).toBe(
      "old",
    );
    expect(targetForDate([oldTarget, newTarget], "2026-08-10")?.id).toBe(
      "new",
    );
  });
});

describe("buildHeatmap", () => {
  it("keeps note-only and future days distinct", () => {
    const cells = buildHeatmap({
      startDate: "2026-08-12",
      endDate: "2026-08-15",
      today: "2026-08-14",
      targets: [dailyTarget],
      checkins: [
        entry("2026-08-12", 0, { note: "Low-energy day" }),
        entry("2026-08-13", 8, { note: "Done before lunch" }),
      ],
    });

    expect(cells.map(({ state }) => state)).toEqual([
      "note-only",
      "complete",
      "missing",
      "future",
    ]);
    expect(cells[1].hasNote).toBe(true);
  });

  it("does not invent missing daily check-ins when a weekly target succeeds", () => {
    const weeklyTarget: HabitTarget = {
      ...dailyTarget,
      id: "weekly",
      metric: "binary",
      targetValue: 3,
      unit: null,
      cadence: "weekly",
      effectiveFrom: "2026-08-10",
    };
    const cells = buildHeatmap({
      startDate: "2026-08-10",
      endDate: "2026-08-16",
      today: "2026-08-16",
      targets: [weeklyTarget],
      checkins: [
        { ...entry("2026-08-10", 1), targetId: "weekly" },
        { ...entry("2026-08-12", 1), targetId: "weekly" },
        { ...entry("2026-08-14", 1), targetId: "weekly" },
      ],
    });

    expect(cells.filter(({ state }) => state === "complete")).toHaveLength(3);
    expect(cells.filter(({ state }) => state === "missing")).toHaveLength(4);
  });
});

describe("calculateHabitStats", () => {
  it("ignores unscheduled days and preserves a streak while today is open", () => {
    const weekdayTarget: HabitTarget = {
      ...dailyTarget,
      metric: "binary",
      targetValue: 1,
      unit: null,
      scheduledWeekdays: [1, 3, 5],
    };
    const checkins = [
      entry("2026-08-07", 1),
      entry("2026-08-10", 1),
      entry("2026-08-12", 1),
    ];

    expect(
      calculateHabitStats({
        habitStartDate: "2026-08-01",
        today: "2026-08-14",
        targets: [weekdayTarget],
        checkins,
      }),
    ).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
      completedPeriods: 3,
      streakUnit: "days",
    });
  });
});

describe("progressForTargetPeriod", () => {
  it("sums only the selected week for a weekly target", () => {
    const weeklyTarget: HabitTarget = {
      ...dailyTarget,
      id: "weekly",
      cadence: "weekly",
      targetValue: 3,
      effectiveFrom: "2026-08-03",
    };
    const checkins = [
      { ...entry("2026-08-07", 2), targetId: "weekly" },
      { ...entry("2026-08-10", 1), targetId: "weekly" },
      { ...entry("2026-08-12", 1), targetId: "weekly" },
    ];

    expect(progressForTargetPeriod(weeklyTarget, "2026-08-14", checkins)).toBe(2);
  });
});

describe("calculateHabitXp", () => {
  it("increases the available XP with daily frequency", () => {
    expect(baseXpForTarget({ ...dailyTarget, cadence: "hourly" })).toBe(4);
    expect(baseXpForTarget({ ...dailyTarget, scheduledWeekdays: [1] })).toBe(10);
    expect(baseXpForTarget({ ...dailyTarget, scheduledWeekdays: [1, 2, 3] })).toBe(14);
    expect(baseXpForTarget({ ...dailyTarget, scheduledWeekdays: null })).toBe(22);
    expect(baseXpForTarget({ ...dailyTarget, cadence: "weekly" })).toBe(30);
  });

  it("awards quantity XP in proportion to progress toward a daily target", () => {
    const xp = calculateHabitXp([dailyTarget], [
      entry("2026-08-14", 2),
      entry("2026-08-15", 6),
      entry("2026-08-16", 8),
    ]);

    expect(xp.get("entry-2026-08-14")).toBe(5);
    expect(xp.get("entry-2026-08-15")).toBe(16);
    expect(xp.get("entry-2026-08-16")).toBe(22);
  });

  it("does not award XP for an optional day outside a scheduled rhythm", () => {
    const threeDayTarget = { ...dailyTarget, scheduledWeekdays: [1, 3, 5] };
    const xp = calculateHabitXp([threeDayTarget], [entry("2026-08-11", 8)]);

    expect(xp.get("entry-2026-08-11")).toBe(0);
  });

  it("splits a weekly XP pool across check-ins without exceeding it", () => {
    const weeklyTarget: HabitTarget = {
      ...dailyTarget,
      id: "weekly-xp",
      cadence: "weekly",
      targetValue: 3,
    };
    const xp = calculateHabitXp([weeklyTarget], [
      { ...entry("2026-08-10", 1), targetId: weeklyTarget.id },
      { ...entry("2026-08-12", 1), targetId: weeklyTarget.id },
      { ...entry("2026-08-14", 1), targetId: weeklyTarget.id },
      { ...entry("2026-08-15", 2, { isSkipped: true }), targetId: weeklyTarget.id },
    ]);

    expect([...xp.values()]).toEqual([10, 10, 10, 0]);
    expect([...xp.values()].reduce((total, value) => total + value, 0)).toBe(30);
  });

  it("awards the smaller hourly XP pool for every completed hour", () => {
    const hourlyTarget: HabitTarget = {
      ...dailyTarget,
      id: "hourly-xp",
      cadence: "hourly",
      targetValue: 2,
    };
    const xp = calculateHabitXp([hourlyTarget], [
      { ...entry("2026-08-14", 2, { id: "hour-8", localHour: 8 }), targetId: hourlyTarget.id },
      { ...entry("2026-08-14", 2, { id: "hour-9", localHour: 9 }), targetId: hourlyTarget.id },
    ]);

    expect([...xp.values()]).toEqual([4, 4]);
    expect(progressForTargetPeriod(hourlyTarget, "2026-08-14", [
      { ...entry("2026-08-14", 2, { id: "hour-8", localHour: 8 }), targetId: hourlyTarget.id },
      { ...entry("2026-08-14", 2, { id: "hour-9", localHour: 9 }), targetId: hourlyTarget.id },
    ])).toBe(4);
  });
});

describe("evaluateCheckpoint", () => {
  it("maps each checkpoint metric to the matching statistic", () => {
    const base: Checkpoint = {
      id: "checkpoint-1",
      habitId: "habit-1",
      title: "First week",
      metric: "completed_periods",
      thresholdValue: 7,
      rewardDescription: "Buy a new book",
      sortOrder: 0,
    };
    const stats = {
      currentStreak: 5,
      longestStreak: 8,
      completedPeriods: 7,
      totalValue: 48,
      streakUnit: "days" as const,
    };

    expect(evaluateCheckpoint(base, stats)).toEqual({
      progress: 7,
      isEarned: true,
    });
    expect(
      evaluateCheckpoint(
        { ...base, metric: "current_streak", thresholdValue: 6 },
        stats,
      ),
    ).toEqual({ progress: 5, isEarned: false });
  });
});
