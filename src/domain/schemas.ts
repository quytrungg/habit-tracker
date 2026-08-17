import { z } from "zod";

import { isValidLocalDate } from "./habit-engine";

export const accentTokenSchema = z.enum([
  "emerald",
  "azure",
  "amber",
  "violet",
  "rose",
  "teal",
  "indigo",
  "lime",
  "coral",
  "fuchsia",
]);

export const customColorSchema = z
  .string()
  .regex(/^#[\da-f]{6}$/i, "Use a six-digit hex color")
  .transform((color) => color.toLowerCase())
  .nullable()
  .optional()
  .default(null);

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format")
  .refine(isValidLocalDate, "Use a valid calendar date");

const weekdaysSchema = z
  .array(z.number().int().min(1).max(7))
  .max(7)
  .nullable()
  .default(null)
  .superRefine((weekdays, context) => {
    if (weekdays && new Set(weekdays).size !== weekdays.length) {
      context.addIssue({
        code: "custom",
        message: "Scheduled weekdays must be unique",
      });
    }
  });

const hoursSchema = z
  .array(z.number().int().min(0).max(23))
  .max(24)
  .nullable()
  .default(null)
  .superRefine((hours, context) => {
    if (hours && new Set(hours).size !== hours.length) {
      context.addIssue({
        code: "custom",
        message: "Scheduled hours must be unique",
      });
    }
  });

export const targetInputSchema = z
  .object({
    metric: z.enum(["binary", "count", "duration"]),
    targetValue: z.coerce.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(32).nullable().optional().default(null),
    cadence: z.enum(["hourly", "daily", "weekly"]),
    scheduledWeekdays: weekdaysSchema,
    scheduledHours: hoursSchema,
  })
  .transform((target) => ({
    ...target,
    targetValue: target.metric === "binary" ? 1 : target.targetValue,
    unit: target.metric === "binary" ? null : target.unit,
    scheduledWeekdays:
      target.cadence === "daily" ? target.scheduledWeekdays : null,
    scheduledHours:
      target.cadence === "hourly" ? target.scheduledHours : null,
  }));

export const checkpointInputSchema = z.object({
  title: z.string().trim().min(1).max(80),
  metric: z.enum(["completed_periods", "current_streak", "total_value"]),
  thresholdValue: z.coerce.number().positive().max(1_000_000),
  rewardDescription: z.string().trim().min(1).max(500),
});

export const createHabitInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional().default(null),
  icon: z.string().trim().min(1).max(32),
  accentToken: accentTokenSchema,
  customColor: customColorSchema,
  startDate: localDateSchema,
  target: targetInputSchema,
  checkpoints: z.array(checkpointInputSchema).max(20).default([]),
});

export const updateHabitInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    icon: z.string().trim().min(1).max(32).optional(),
    accentToken: accentTokenSchema.optional(),
    customColor: customColorSchema.optional(),
    archived: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export const upsertCheckinInputSchema = z
  .object({
    value: z.coerce.number().min(0).max(1_000_000).default(0),
    isSkipped: z.boolean().default(false),
    note: z.string().trim().max(2_000).nullable().optional().default(null),
  })
  .transform((entry) => ({
    ...entry,
    value: entry.isSkipped ? 0 : entry.value,
    note: entry.note || null,
  }));

export const createTargetVersionInputSchema = z.object({
  effectiveFrom: localDateSchema,
  target: targetInputSchema,
});

export const registerInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8).max(128),
  timezone: z.string().trim().min(1).max(80),
});

export const loginInputSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

export const updateSettingsInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    timezone: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes supplied");

export type CreateHabitInput = z.infer<typeof createHabitInputSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitInputSchema>;
export type UpsertCheckinInput = z.infer<typeof upsertCheckinInputSchema>;
export type CreateTargetVersionInput = z.infer<
  typeof createTargetVersionInputSchema
>;
