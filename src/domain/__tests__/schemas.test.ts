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
