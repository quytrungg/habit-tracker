import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  createHabit,
  createTargetVersion,
  getDashboard,
  upsertCheckin,
} from "@/server/services/habit-service";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integration tests");
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const database = drizzle(sql, { schema });

const createUser = async (email: string, timezone = "Asia/Ho_Chi_Minh") => {
  const [user] = await database
    .insert(schema.users)
    .values({
      email,
      displayName: email.split("@")[0],
      passwordHash: "test-only-hash",
      timezone,
    })
    .returning();
  return user;
};

const habitInput = {
  name: "Drink water",
  description: "Eight glasses every day",
  icon: "💧",
  accentToken: "azure" as const,
  startDate: "2026-08-10",
  target: {
    metric: "count" as const,
    targetValue: 8,
    unit: "glasses",
    cadence: "daily" as const,
    scheduledWeekdays: null,
  },
  checkpoints: [
    {
      title: "Two strong days",
      metric: "completed_periods" as const,
      thresholdValue: 2,
      rewardDescription: "Make a favorite tea",
    },
  ],
};

beforeAll(async () => {
  await migrate(database, { migrationsFolder: "./src/db/migrations" });
});

beforeEach(async () => {
  await sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`;
});

afterAll(async () => {
  await sql.end();
});

describe("habit service", () => {
  it("creates the habit, initial target, and checkpoints atomically", async () => {
    const user = await createUser("owner@example.com");

    const result = await createHabit(database, user.id, habitInput);

    expect(result.habit.name).toBe("Drink water");
    expect(result.target).toMatchObject({ targetValue: 8, unit: "glasses" });
    expect(result.checkpoints).toHaveLength(1);
    const [counts] = await sql<
      { habits: number; targets: number; checkpoints: number }[]
    >`SELECT
        (SELECT count(*)::int FROM habits) AS habits,
        (SELECT count(*)::int FROM habit_targets) AS targets,
        (SELECT count(*)::int FROM habit_checkpoints) AS checkpoints`;
    expect(counts).toEqual({ habits: 1, targets: 1, checkpoints: 1 });
  });

  it("does not disclose one user's habit on another user's dashboard", async () => {
    const owner = await createUser("owner@example.com");
    const stranger = await createUser("stranger@example.com");
    await createHabit(database, owner.id, habitInput);

    const dashboard = await getDashboard(database, {
      userId: stranger.id,
      from: "2026-08-10",
      to: "2026-08-14",
      today: "2026-08-14",
    });

    expect(dashboard.habits).toEqual([]);
  });

  it("upserts one note-bearing entry per local day and preserves the note", async () => {
    const user = await createUser("owner@example.com");
    const { habit } = await createHabit(database, user.id, habitInput);

    await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-14",
      input: { value: 4, isSkipped: false, note: "Morning bottles" },
      now: new Date("2026-08-14T08:00:00.000Z"),
    });
    const result = await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-14",
      input: { value: 8, isSkipped: false, note: "Finished after lunch" },
      now: new Date("2026-08-14T12:00:00.000Z"),
    });

    expect(result.checkin).toMatchObject({
      value: 8,
      note: "Finished after lunch",
    });
    const [{ count }] = await sql<{ count: number }[]>
      `SELECT count(*)::int AS count FROM habit_checkins`;
    expect(count).toBe(1);
  });

  it("awards a checkpoint once when progress crosses its threshold", async () => {
    const user = await createUser("owner@example.com");
    const { habit } = await createHabit(database, user.id, habitInput);

    await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-13",
      input: { value: 8, isSkipped: false, note: null },
      now: new Date("2026-08-13T12:00:00.000Z"),
    });
    const crossing = await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-14",
      input: { value: 8, isSkipped: false, note: "Two in a row" },
      now: new Date("2026-08-14T12:00:00.000Z"),
    });
    const retry = await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-14",
      input: { value: 8, isSkipped: false, note: "Two in a row" },
      now: new Date("2026-08-14T12:01:00.000Z"),
    });

    expect(crossing.newAwards).toHaveLength(1);
    expect(retry.newAwards).toHaveLength(0);
    const [{ count }] = await sql<{ count: number }[]>
      `SELECT count(*)::int AS count FROM checkpoint_awards`;
    expect(count).toBe(1);
  });

  it("returns not-found for a cross-account check-in mutation", async () => {
    const owner = await createUser("owner@example.com");
    const stranger = await createUser("stranger@example.com");
    const { habit } = await createHabit(database, owner.id, habitInput);

    await expect(
      upsertCheckin(database, {
        userId: stranger.id,
        habitId: habit.id,
        localDate: "2026-08-14",
        input: { value: 8, isSkipped: false, note: null },
        now: new Date("2026-08-14T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("versions a target without changing the target attached to a past entry", async () => {
    const user = await createUser("owner@example.com");
    const { habit, target: oldTarget } = await createHabit(
      database,
      user.id,
      habitInput,
    );
    await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-13",
      input: { value: 8, isSkipped: false, note: "Old target" },
      now: new Date("2026-08-13T12:00:00.000Z"),
    });
    await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-14",
      input: { value: 8, isSkipped: false, note: "Today" },
      now: new Date("2026-08-14T03:00:00.000Z"),
    });

    const version = await createTargetVersion(database, {
      userId: user.id,
      habitId: habit.id,
      input: {
        effectiveFrom: "2026-08-14",
        target: {
          metric: "count",
          targetValue: 10,
          unit: "glasses",
          cadence: "daily",
          scheduledWeekdays: null,
        },
      },
      now: new Date("2026-08-14T04:00:00.000Z"),
    });

    const entries = await database
      .select()
      .from(schema.habitCheckins)
      .orderBy(schema.habitCheckins.localDate);
    expect(version.target.targetValue).toBe(10);
    expect(entries[0].targetId).toBe(oldTarget.id);
    expect(entries[1].targetId).toBe(version.target.id);
  });

  it("keeps a note when progress is cleared", async () => {
    const user = await createUser("owner@example.com");
    const { habit } = await createHabit(database, user.id, habitInput);
    await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-14",
      input: { value: 8, isSkipped: false, note: "Useful context" },
      now: new Date("2026-08-14T04:00:00.000Z"),
    });

    const result = await upsertCheckin(database, {
      userId: user.id,
      habitId: habit.id,
      localDate: "2026-08-14",
      input: { value: 0, isSkipped: false, note: "Useful context" },
      now: new Date("2026-08-14T05:00:00.000Z"),
    });

    expect(result.checkin).toMatchObject({ value: 0, note: "Useful context" });
  });
});
