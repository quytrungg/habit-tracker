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
    customColor: null,
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
  it("confirms a binary check-in before saving it", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ checkin: { id: "entry-1" }, newAwards: [], xpDelta: 22 })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ habits: [{ ...item, todayValue: 1 }], totalXp: 22, xpHistory: [] })),
      );
    const user = userEvent.setup();
    render(
      <HabitDashboard
        from="2026-08-01"
        initialData={{ habits: [item], totalXp: 0, xpHistory: [] }}
        today="2026-08-14"
        userName="Mai"
      />,
    );

    expect(screen.getByRole("heading", { name: "Study" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current streak: 2 days")).toBeInTheDocument();
    expect(screen.getByText("Up to 22 XP for this target")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check in Study" }));
    expect(screen.getByRole("dialog", { name: "Mark Study as done?" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, mark as done" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("+22 XP earned")).toBeInTheDocument();
    expect(screen.getByLabelText("22 total experience points")).toBeInTheDocument();
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
        initialData={{ habits: [], totalXp: 0, xpHistory: [] }}
        today="2026-08-14"
        userName="Mai"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Create a new habit" }));
    expect(
      screen.getByRole("dialog", { name: "Create a habit" }),
    ).toBeInTheDocument();
  });

  it("shows archived habits as read-only history in their own tab", async () => {
    const user = userEvent.setup();
    render(
      <HabitDashboard
        from="2026-08-01"
        initialData={{ habits: [], archivedHabits: [item], totalXp: 0, xpHistory: [] }}
        today="2026-08-14"
        userName="Mai"
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Archived 1" }));

    expect(screen.getByText("Archived · read-only history")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check in Study" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "August 14, 2026, 0 of 1" })).toBeDisabled();
  });

  it("opens the daily-flow summary and Boost plan picker", async () => {
    const user = userEvent.setup();
    render(
      <HabitDashboard
        from="2026-08-01"
        initialData={{
          habits: [item],
          totalXp: 22,
          xpHistory: [{ date: "2026-08-14", earnedXp: 22, totalXp: 22 }],
        }}
        today="2026-08-14"
        userName="Mai"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open today’s flow" }));
    expect(screen.getByRole("dialog", { name: "Your daily rhythm" })).toBeInTheDocument();
    expect(screen.getByText("0 of 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close today’s flow" }));
    await user.click(screen.getByRole("button", { name: "Boost" }));
    expect(screen.getByRole("dialog", { name: "Choose a plan" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Continue to Stripe" })[0]).toHaveAttribute(
      "href",
      "/checkout?plan=focus",
    );
  });
});
