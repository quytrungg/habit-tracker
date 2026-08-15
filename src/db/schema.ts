import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const habitMetricEnum = pgEnum("habit_metric", [
  "binary",
  "count",
  "duration",
]);
export const habitCadenceEnum = pgEnum("habit_cadence", ["daily", "weekly"]);
export const checkpointMetricEnum = pgEnum("checkpoint_metric", [
  "completed_periods",
  "current_streak",
  "total_value",
]);
export const accentTokenEnum = pgEnum("accent_token", [
  "emerald",
  "azure",
  "amber",
  "violet",
  "rose",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    timezone: varchar("timezone", { length: 80 })
      .default("UTC")
      .notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_id_idx").on(table.userId),
    index("auth_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 500 }),
    icon: varchar("icon", { length: 32 }).notNull(),
    accentToken: accentTokenEnum("accent_token").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("habits_user_active_sort_idx")
      .on(table.userId, table.sortOrder)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export const habitTargets = pgTable(
  "habit_targets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    metric: habitMetricEnum("metric").notNull(),
    targetValue: numeric("target_value", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    unit: varchar("unit", { length: 32 }),
    cadence: habitCadenceEnum("cadence").notNull(),
    scheduledWeekdays: smallint("scheduled_weekdays").array(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("habit_targets_habit_dates_idx").on(
      table.habitId,
      table.effectiveFrom,
      table.effectiveTo,
    ),
    uniqueIndex("habit_targets_open_ended_unique")
      .on(table.habitId)
      .where(sql`${table.effectiveTo} is null`),
    check("habit_targets_value_positive", sql`${table.targetValue} > 0`),
    check(
      "habit_targets_valid_range",
      sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`,
    ),
    check(
      "habit_targets_binary_shape",
      sql`${table.metric} <> 'binary' or (${table.targetValue} = 1 and ${table.unit} is null)`,
    ),
  ],
);

export const habitCheckins = pgTable(
  "habit_checkins",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => habitTargets.id, { onDelete: "restrict" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    value: numeric("value", {
      precision: 12,
      scale: 2,
      mode: "number",
    })
      .default(0)
      .notNull(),
    isSkipped: boolean("is_skipped").default(false).notNull(),
    note: varchar("note", { length: 2_000 }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("habit_checkins_habit_date_unique").on(
      table.habitId,
      table.localDate,
    ),
    index("habit_checkins_habit_date_idx").on(
      table.habitId,
      table.localDate,
    ),
    check("habit_checkins_value_non_negative", sql`${table.value} >= 0`),
    check(
      "habit_checkins_skipped_zero",
      sql`not ${table.isSkipped} or ${table.value} = 0`,
    ),
  ],
);

export const habitCheckpoints = pgTable(
  "habit_checkpoints",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id")
      .notNull()
      .references(() => habits.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 80 }).notNull(),
    metric: checkpointMetricEnum("metric").notNull(),
    thresholdValue: numeric("threshold_value", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    rewardDescription: varchar("reward_description", { length: 500 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index("habit_checkpoints_habit_sort_idx").on(
      table.habitId,
      table.sortOrder,
    ),
    check(
      "habit_checkpoints_threshold_positive",
      sql`${table.thresholdValue} > 0`,
    ),
  ],
);

export const checkpointAwards = pgTable(
  "checkpoint_awards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    checkpointId: uuid("checkpoint_id")
      .notNull()
      .references(() => habitCheckpoints.id, { onDelete: "restrict" }),
    triggerCheckinId: uuid("trigger_checkin_id").references(
      () => habitCheckins.id,
      { onDelete: "set null" },
    ),
    progressSnapshot: numeric("progress_snapshot", {
      precision: 12,
      scale: 2,
      mode: "number",
    }).notNull(),
    earnedAt: timestamp("earned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("checkpoint_awards_checkpoint_unique").on(table.checkpointId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type HabitRow = typeof habits.$inferSelect;
export type HabitTargetRow = typeof habitTargets.$inferSelect;
export type HabitCheckinRow = typeof habitCheckins.$inferSelect;
export type HabitCheckpointRow = typeof habitCheckpoints.$inferSelect;
export type CheckpointAwardRow = typeof checkpointAwards.$inferSelect;
