import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HabitForm } from "@/components/habits/habit-form";

afterEach(() => vi.restoreAllMocks());

describe("HabitForm", () => {
  it("creates a measured habit with its first reward checkpoint", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ habit: { id: "habit-1" } }), { status: 201 }));
    const onCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <HabitForm
        onClose={vi.fn()}
        onCreated={onCreated}
        today="2026-08-14"
      />,
    );

    await user.type(screen.getByLabelText("Habit name"), "Drink water");
    await user.selectOptions(screen.getByLabelText("How do you measure it?"), "count");
    await user.clear(screen.getByLabelText("Daily target"));
    await user.type(screen.getByLabelText("Daily target"), "8");
    await user.type(screen.getByLabelText("Unit"), "glasses");
    await user.click(screen.getByRole("button", { name: "Add checkpoint" }));
    await user.type(screen.getByLabelText("Checkpoint title 1"), "First week");
    await user.clear(screen.getByLabelText("Checkpoint threshold 1"));
    await user.type(screen.getByLabelText("Checkpoint threshold 1"), "7");
    await user.type(screen.getByLabelText("Reward 1"), "Buy a new bottle");
    const submitButton = screen.getByRole("button", { name: "Create habit" });
    fireEvent.submit(submitButton.closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const request = fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      name: "Drink water",
      target: { metric: "count", targetValue: 8, unit: "glasses" },
      checkpoints: [
        {
          title: "First week",
          thresholdValue: 7,
          rewardDescription: "Buy a new bottle",
        },
      ],
    });
    expect(onCreated).toHaveBeenCalled();
  });
});
