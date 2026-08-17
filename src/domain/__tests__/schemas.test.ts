import { describe, expect, it } from "vitest";

import {
  createHabitInputSchema,
  upsertCheckinInputSchema,
} from "@/domain/schemas";

describe("createHabitInputSchema", () => {
  const base = {
    name: "Drink water",
    description: "Stay hydrated",
    icon: "💧",
    accentToken: "azure",
    customColor: null,
    startDate: "2026-08-14",
    target: {
      metric: "count",
      targetValue: 8,
      unit: "glasses",
      cadence: "daily",
      scheduledWeekdays: null,
    },
    checkpoints: [
      {
        title: "First week",
        metric: "completed_periods",
        thresholdValue: 7,
        rewardDescription: "Buy a new bottle",
      },
    ],
  };

  it("accepts a quantified habit with a checkpoint", () => {
    expect(createHabitInputSchema.safeParse(base).success).toBe(true);
  });

  it("accepts hourly targets without a weekday schedule", () => {
    const result = createHabitInputSchema.parse({
      ...base,
      target: { ...base.target, cadence: "hourly", scheduledWeekdays: [1, 3] },
    });

    expect(result.target).toMatchObject({ cadence: "hourly", scheduledWeekdays: null });
  });

  it("keeps only the selected hours for hourly targets", () => {
    const result = createHabitInputSchema.parse({
      ...base,
      target: {
        ...base.target,
        cadence: "hourly",
        scheduledWeekdays: [1, 3],
        scheduledHours: [8, 12, 18],
      },
    });

    expect(result.target).toMatchObject({
      scheduledWeekdays: null,
      scheduledHours: [8, 12, 18],
    });
  });

  it("accepts a custom six-digit color and normalizes its casing", () => {
    expect(
      createHabitInputSchema.parse({ ...base, customColor: "#A1b2C3" }).customColor,
    ).toBe("#a1b2c3");
  });

  it("normalizes binary habits to one completion with no unit", () => {
    const result = createHabitInputSchema.parse({
      ...base,
      target: {
        metric: "binary",
        targetValue: 99,
        unit: "times",
        cadence: "daily",
        scheduledWeekdays: [1, 3, 5],
      },
    });

    expect(result.target).toMatchObject({ targetValue: 1, unit: null });
  });

  it("rejects duplicate or out-of-range weekdays", () => {
    expect(
      createHabitInputSchema.safeParse({
        ...base,
        target: { ...base.target, scheduledWeekdays: [1, 1, 8] },
      }).success,
    ).toBe(false);
  });
});

describe("upsertCheckinInputSchema", () => {
  it("permits a note-only day", () => {
    expect(
      upsertCheckinInputSchema.parse({
        value: 0,
        isSkipped: false,
        note: "I chose to rest deliberately.",
      }),
    ).toMatchObject({ value: 0, isSkipped: false });
  });

  it("forces a skipped day to zero", () => {
    expect(
      upsertCheckinInputSchema.parse({ value: 4, isSkipped: true, note: "Sick" }),
    ).toMatchObject({ value: 0, isSkipped: true });
  });
});
