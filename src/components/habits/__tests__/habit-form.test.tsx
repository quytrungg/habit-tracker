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
    await user.click(screen.getByRole("radio", { name: "A quantity" }));
    expect(screen.getByLabelText("Daily target")).toHaveAttribute("min", "1");
    expect(screen.getByLabelText("Daily target")).toHaveAttribute("step", "1");
    await user.clear(screen.getByLabelText("Daily target"));
    await user.type(screen.getByLabelText("Daily target"), "5");
    expect((screen.getByLabelText("Daily target") as HTMLInputElement).validity.valid).toBe(true);
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

  it("submits a custom emoji and color selected through the plus controls", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ habit: { id: "habit-1" } }), { status: 201 }));
    const user = userEvent.setup();
    render(<HabitForm onClose={vi.fn()} onCreated={vi.fn()} today="2026-08-14" />);

    await user.type(screen.getByLabelText("Habit name"), "Sketch");
    await user.click(screen.getByRole("button", { name: "Use a custom emoji" }));
    await user.clear(screen.getByLabelText("Custom emoji"));
    await user.type(screen.getByLabelText("Custom emoji"), "🎨");
    fireEvent.change(screen.getByLabelText("Custom color"), { target: { value: "#123456" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create habit" }).closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      icon: "🎨",
      customColor: "#123456",
    });
  });

  it("allows an integer duration target without a step mismatch", async () => {
    const user = userEvent.setup();
    render(<HabitForm onClose={vi.fn()} onCreated={vi.fn()} today="2026-08-14" />);

    await user.click(screen.getByRole("radio", { name: "Time spent" }));
    const target = screen.getByLabelText("Daily target") as HTMLInputElement;
    expect(target).toHaveAttribute("step", "1");
    await user.clear(target);
    await user.type(target, "8");
    expect(target.validity.valid).toBe(true);
  });

  it("offers an hourly target cadence", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ habit: { id: "habit-1" } }), { status: 201 }));
    const user = userEvent.setup();
    render(<HabitForm onClose={vi.fn()} onCreated={vi.fn()} today="2026-08-14" />);

    await user.type(screen.getByLabelText("Habit name"), "Stretch");
    await user.click(screen.getByRole("radio", { name: "A quantity" }));
    await user.click(screen.getByRole("radio", { name: "Hourly" }));
    await user.click(screen.getByRole("button", { name: "Toggle 08:00" }));

    expect(screen.getByLabelText("Hourly target")).toHaveAttribute("step", "1");
    await user.type(screen.getByLabelText("Unit"), "minutes");
    fireEvent.submit(screen.getByRole("button", { name: "Create habit" }).closest("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      target: { cadence: "hourly", scheduledHours: [8] },
    });
  });
});
