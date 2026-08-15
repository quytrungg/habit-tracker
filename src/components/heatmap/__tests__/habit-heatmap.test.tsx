import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HabitHeatmap } from "@/components/heatmap/habit-heatmap";
import type { HeatmapCell } from "@/domain/types";

const cell = (date: string, state: HeatmapCell["state"]): HeatmapCell => ({
  date,
  state,
  value: state === "complete" ? 1 : 0,
  targetValue: 1,
  intensity: state === "complete" ? 4 : 0,
  hasNote: state === "complete",
  label: `${date}, ${state}`,
});

describe("HabitHeatmap", () => {
  it("exposes each day as a labelled button and opens past dates", async () => {
    const onSelectDate = vi.fn();
    const user = userEvent.setup();
    render(
      <HabitHeatmap
        cells={[
          cell("2026-08-13", "complete"),
          cell("2026-08-14", "missing"),
          cell("2026-08-15", "future"),
        ]}
        onSelectDate={onSelectDate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "2026-08-13, complete" }));
    expect(onSelectDate).toHaveBeenCalledWith("2026-08-13");
    expect(
      screen.getByRole("button", { name: "2026-08-15, future" }),
    ).toBeDisabled();
  });
});
