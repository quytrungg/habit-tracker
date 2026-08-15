import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HabitDashboard } from "@/components/habits/habit-dashboard";
import type { DashboardHabit } from "@/server/services/habit-service";

afterEach(() => vi.restoreAllMocks());

const item: DashboardHabit = {
  habit: {
    id: "habit-1",
    name: "Study",
    description: "Read one focused chapter",
    icon: "📚",
    accentToken: "emerald",
    startDate: "2026-08-01",
    sortOrder: 0,
  },
  targets: [
    {
      id: "target-1",
      habitId: "habit-1",
      metric: "binary",
      targetValue: 1,
      unit: null,
      cadence: "daily",
      scheduledWeekdays: null,
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
    },
  ],
  checkins: [],
  checkpoints: [],
  heatmap: [
    {
      date: "2026-08-14",
      state: "missing",
      value: 0,
      targetValue: 1,
      intensity: 0,
      hasNote: false,
      label: "August 14, 2026, 0 of 1",
    },
  ],
  stats: {
    currentStreak: 2,
    longestStreak: 4,
    completedPeriods: 5,
    totalValue: 5,
    streakUnit: "days",
  },
  todayValue: 0,
  nextCheckpoint: null,
};

describe("HabitDashboard", () => {
  it("shows themed cards and performs a one-tap binary check-in", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ checkin: { id: "entry-1" }, newAwards: [] })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ habits: [{ ...item, todayValue: 1 }] })),
      );
    const user = userEvent.setup();
    render(
      <HabitDashboard
        from="2026-08-01"
        initialData={{ habits: [item] }}
        today="2026-08-14"
        userName="Mai"
      />,
    );

    expect(screen.getByRole("heading", { name: "Study" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current streak: 2 days")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check in Study" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/habits/habit-1/checkins/2026-08-14",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      value: 1,
    });
  });

  it("opens the complete habit builder from the add button", async () => {
    const user = userEvent.setup();
    render(
      <HabitDashboard
        from="2026-08-01"
        initialData={{ habits: [] }}
        today="2026-08-14"
        userName="Mai"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create a new habit" }));
    expect(
      screen.getByRole("dialog", { name: "Create a habit" }),
    ).toBeInTheDocument();
  });
});
