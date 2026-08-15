import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CheckInDrawer } from "@/components/check-in/check-in-drawer";
import type { DashboardHabit } from "@/server/services/habit-service";

afterEach(() => vi.restoreAllMocks());

const habit: DashboardHabit = {
  habit: {
    id: "habit-1",
    name: "Drink water",
    description: null,
    icon: "💧",
    accentToken: "azure",
    startDate: "2026-08-01",
    sortOrder: 0,
  },
  targets: [
    {
      id: "target-1",
      habitId: "habit-1",
      metric: "count",
      targetValue: 8,
      unit: "glasses",
      cadence: "daily",
      scheduledWeekdays: null,
      effectiveFrom: "2026-08-01",
      effectiveTo: null,
    },
  ],
  checkins: [
    {
      id: "entry-1",
      habitId: "habit-1",
      targetId: "target-1",
      localDate: "2026-08-13",
      value: 4,
      isSkipped: false,
      note: "Morning bottles",
    },
  ],
  checkpoints: [],
  heatmap: [],
  stats: {
    currentStreak: 0,
    longestStreak: 0,
    completedPeriods: 0,
    totalValue: 4,
    streakUnit: "days",
  },
  todayValue: 0,
  nextCheckpoint: null,
};

describe("CheckInDrawer", () => {
  it("edits progress and the note for the selected habit day", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ checkin: { id: "entry-1" }, newAwards: [] })),
    );
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(
      <CheckInDrawer
        date="2026-08-13"
        habit={habit}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    await user.clear(screen.getByLabelText("Progress in glasses"));
    await user.type(screen.getByLabelText("Progress in glasses"), "8");
    await user.clear(screen.getByLabelText("Daily note"));
    await user.type(screen.getByLabelText("Daily note"), "Finished after lunch");
    await user.click(screen.getByRole("button", { name: "Save check-in" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/habits/habit-1/checkins/2026-08-13",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      value: 8,
      isSkipped: false,
      note: "Finished after lunch",
    });
    expect(onSaved).toHaveBeenCalledWith([]);
  });

  it("keeps the note when only progress is cleared", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ checkin: { id: "entry-1" }, newAwards: [] })),
    );
    const user = userEvent.setup();
    render(
      <CheckInDrawer
        date="2026-08-13"
        habit={habit}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Clear progress" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      value: 0,
      note: "Morning bottles",
    });
  });
});
