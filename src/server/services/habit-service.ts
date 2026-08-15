import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  max,
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getISODay, parseISO } from "date-fns";

import * as schema from "@/db/schema";
import {
  buildHeatmap,
  calculateHabitStats,
  evaluateCheckpoint,
  isValidLocalDate,
  previousLocalDate,
  progressForTargetPeriod,
  targetForDate,
  todayInTimeZone,
} from "@/domain/habit-engine";
import {
  createHabitInputSchema,
  createTargetVersionInputSchema,
  checkpointInputSchema,
  updateHabitInputSchema,
  upsertCheckinInputSchema,
} from "@/domain/schemas";
import type {
  Checkin,
  Checkpoint,
  HabitTarget,
} from "@/domain/types";

import { ServiceError } from "./errors";

export type HabitDatabase = PostgresJsDatabase<typeof schema>;

const toTarget = (row: schema.HabitTargetRow): HabitTarget => ({
  id: row.id,
  habitId: row.habitId,
  metric: row.metric,
  targetValue: row.targetValue,
  unit: row.unit,
  cadence: row.cadence,
  scheduledWeekdays: row.scheduledWeekdays,
  effectiveFrom: row.effectiveFrom,
  effectiveTo: row.effectiveTo,
});

const toCheckin = (row: schema.HabitCheckinRow): Checkin => ({
  id: row.id,
  habitId: row.habitId,
  targetId: row.targetId,
  localDate: row.localDate,
  value: row.value,
  isSkipped: row.isSkipped,
  note: row.note,
});

const toCheckpoint = (row: schema.HabitCheckpointRow): Checkpoint => ({
  id: row.id,
  habitId: row.habitId,
  title: row.title,
  metric: row.metric,
  thresholdValue: row.thresholdValue,
  rewardDescription: row.rewardDescription,
  sortOrder: row.sortOrder,
});

export async function createHabit(
  database: HabitDatabase,
  userId: string,
  untrustedInput: unknown,
) {
  const parsed = createHabitInputSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", "Habit details are invalid", {
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;

  return database.transaction(async (transaction) => {
    const [order] = await transaction
      .select({ highest: max(schema.habits.sortOrder) })
      .from(schema.habits)
      .where(eq(schema.habits.userId, userId));

    const [habit] = await transaction
      .insert(schema.habits)
      .values({
        userId,
        name: input.name,
        description: input.description,
        icon: input.icon,
        accentToken: input.accentToken,
        startDate: input.startDate,
        sortOrder: Number(order?.highest ?? -1) + 1,
      })
      .returning();

    const [target] = await transaction
      .insert(schema.habitTargets)
      .values({
        habitId: habit.id,
        metric: input.target.metric,
        targetValue: input.target.targetValue,
        unit: input.target.unit,
        cadence: input.target.cadence,
        scheduledWeekdays: input.target.scheduledWeekdays,
        effectiveFrom: input.startDate,
      })
      .returning();

    const checkpoints = input.checkpoints.length
      ? await transaction
          .insert(schema.habitCheckpoints)
          .values(
            input.checkpoints.map((checkpoint, index) => ({
              habitId: habit.id,
              ...checkpoint,
              sortOrder: index,
            })),
          )
          .returning()
      : [];

    return { habit, target, checkpoints };
  });
}

export async function createTargetVersion(
  database: HabitDatabase,
  {
    userId,
    habitId,
    input: untrustedInput,
    now = new Date(),
  }: {
    userId: string;
    habitId: string;
    input: unknown;
    now?: Date;
  },
) {
  const parsed = createTargetVersionInputSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", "Target details are invalid", {
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;
  const { timezone } = await ownedHabitWithUser(database, userId, habitId);
  const today = todayInTimeZone(timezone, now);
  if (input.effectiveFrom < today) {
    throw new ServiceError("VALIDATION_ERROR", "Targets cannot be backdated");
  }

  const [openTarget] = await database
    .select()
    .from(schema.habitTargets)
    .where(
      and(
        eq(schema.habitTargets.habitId, habitId),
        isNull(schema.habitTargets.effectiveTo),
      ),
    )
    .limit(1);
  if (!openTarget) {
    throw new ServiceError("CONFLICT", "Habit has no current target");
  }
  if (openTarget.effectiveFrom > today) {
    throw new ServiceError("CONFLICT", "A future target is already scheduled");
  }
  if (input.effectiveFrom < openTarget.effectiveFrom) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "A new target cannot begin before the current target",
    );
  }

  if (input.effectiveFrom === openTarget.effectiveFrom) {
    const [target] = await database
      .update(schema.habitTargets)
      .set({
        metric: input.target.metric,
        targetValue: input.target.targetValue,
        unit: input.target.unit,
        cadence: input.target.cadence,
        scheduledWeekdays: input.target.scheduledWeekdays,
      })
      .where(eq(schema.habitTargets.id, openTarget.id))
      .returning();
    return { target };
  }

  const touchesWeeklyCadence =
    openTarget.cadence === "weekly" || input.target.cadence === "weekly";
  if (
    touchesWeeklyCadence &&
    getISODay(parseISO(`${input.effectiveFrom}T12:00:00`)) !== 1
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Weekly target changes must take effect on a Monday",
    );
  }

  return database.transaction(async (transaction) => {
    await transaction
      .update(schema.habitTargets)
      .set({ effectiveTo: previousLocalDate(input.effectiveFrom) })
      .where(eq(schema.habitTargets.id, openTarget.id));

    const [target] = await transaction
      .insert(schema.habitTargets)
      .values({
        habitId,
        metric: input.target.metric,
        targetValue: input.target.targetValue,
        unit: input.target.unit,
        cadence: input.target.cadence,
        scheduledWeekdays: input.target.scheduledWeekdays,
        effectiveFrom: input.effectiveFrom,
      })
      .returning();

    await transaction
      .update(schema.habitCheckins)
      .set({ targetId: target.id, updatedAt: now })
      .where(
        and(
          eq(schema.habitCheckins.habitId, habitId),
          gte(schema.habitCheckins.localDate, input.effectiveFrom),
        ),
      );

    return { target };
  });
}

export async function updateHabit(
  database: HabitDatabase,
  userId: string,
  habitId: string,
  untrustedInput: unknown,
) {
  const parsed = updateHabitInputSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", "Habit changes are invalid", {
      details: parsed.error.flatten(),
    });
  }
  await ownedHabitWithUser(database, userId, habitId);
  const { archived, ...fields } = parsed.data;
  const [habit] = await database
    .update(schema.habits)
    .set({
      ...fields,
      ...(archived === undefined
        ? {}
        : { archivedAt: archived ? new Date() : null }),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.habits.id, habitId), eq(schema.habits.userId, userId)))
    .returning();
  return habit;
}

export async function createCheckpoint(
  database: HabitDatabase,
  userId: string,
  habitId: string,
  untrustedInput: unknown,
) {
  const parsed = checkpointInputSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", "Checkpoint details are invalid", {
      details: parsed.error.flatten(),
    });
  }
  await ownedHabitWithUser(database, userId, habitId);
  const [order] = await database
    .select({ highest: max(schema.habitCheckpoints.sortOrder) })
    .from(schema.habitCheckpoints)
    .where(eq(schema.habitCheckpoints.habitId, habitId));
  const [checkpoint] = await database
    .insert(schema.habitCheckpoints)
    .values({
      habitId,
      ...parsed.data,
      sortOrder: Number(order?.highest ?? -1) + 1,
    })
    .returning();
  return checkpoint;
}

export async function deleteCheckpoint(
  database: HabitDatabase,
  userId: string,
  habitId: string,
  checkpointId: string,
) {
  await ownedHabitWithUser(database, userId, habitId);
  const [checkpoint] = await database
    .select({ id: schema.habitCheckpoints.id })
    .from(schema.habitCheckpoints)
    .where(
      and(
        eq(schema.habitCheckpoints.id, checkpointId),
        eq(schema.habitCheckpoints.habitId, habitId),
      ),
    )
    .limit(1);
  if (!checkpoint) throw new ServiceError("NOT_FOUND", "Checkpoint was not found");
  const [award] = await database
    .select({ id: schema.checkpointAwards.id })
    .from(schema.checkpointAwards)
    .where(eq(schema.checkpointAwards.checkpointId, checkpointId))
    .limit(1);
  if (award) {
    throw new ServiceError(
      "CONFLICT",
      "Earned checkpoints remain in reward history",
    );
  }
  await database
    .delete(schema.habitCheckpoints)
    .where(eq(schema.habitCheckpoints.id, checkpointId));
}

export async function deleteCheckin(
  database: HabitDatabase,
  userId: string,
  habitId: string,
  localDate: string,
) {
  if (!isValidLocalDate(localDate)) {
    throw new ServiceError("VALIDATION_ERROR", "Check-in date is invalid");
  }
  await ownedHabitWithUser(database, userId, habitId);
  const [deleted] = await database
    .delete(schema.habitCheckins)
    .where(
      and(
        eq(schema.habitCheckins.habitId, habitId),
        eq(schema.habitCheckins.localDate, localDate),
      ),
    )
    .returning({ id: schema.habitCheckins.id });
  if (!deleted) throw new ServiceError("NOT_FOUND", "Check-in was not found");
}

export type DashboardHabit = {
  habit: Pick<
    schema.HabitRow,
    | "id"
    | "name"
    | "description"
    | "icon"
    | "accentToken"
    | "startDate"
    | "sortOrder"
  >;
  targets: HabitTarget[];
  checkins: Checkin[];
  checkpoints: Array<
    Checkpoint & {
      progress: number;
      isEarned: boolean;
      earnedAt: string | null;
    }
  >;
  heatmap: ReturnType<typeof buildHeatmap>;
  stats: ReturnType<typeof calculateHabitStats>;
  todayValue: number;
  nextCheckpoint: {
    id: string;
    title: string;
    rewardDescription: string;
    progress: number;
    thresholdValue: number;
  } | null;
};

export async function getDashboard(
  database: HabitDatabase,
  {
    userId,
    from,
    to,
    today,
  }: { userId: string; from: string; to: string; today: string },
) {
  if (![from, to, today].every(isValidLocalDate) || from > to) {
    throw new ServiceError("VALIDATION_ERROR", "Dashboard date range is invalid");
  }

  const habitRows = await database
    .select()
    .from(schema.habits)
    .where(and(eq(schema.habits.userId, userId), isNull(schema.habits.archivedAt)))
    .orderBy(asc(schema.habits.sortOrder), asc(schema.habits.createdAt));

  if (!habitRows.length) return { habits: [] as DashboardHabit[] };
  const habitIds = habitRows.map(({ id }) => id);

  const [targetRows, checkinRows, checkpointRows] = await Promise.all([
    database
      .select()
      .from(schema.habitTargets)
      .where(inArray(schema.habitTargets.habitId, habitIds))
      .orderBy(asc(schema.habitTargets.effectiveFrom)),
    database
      .select()
      .from(schema.habitCheckins)
      .where(
        and(
          inArray(schema.habitCheckins.habitId, habitIds),
          lte(schema.habitCheckins.localDate, to),
        ),
      )
      .orderBy(asc(schema.habitCheckins.localDate)),
    database
      .select()
      .from(schema.habitCheckpoints)
      .where(inArray(schema.habitCheckpoints.habitId, habitIds))
      .orderBy(
        asc(schema.habitCheckpoints.sortOrder),
        asc(schema.habitCheckpoints.createdAt),
      ),
  ]);

  const checkpointIds = checkpointRows.map(({ id }) => id);
  const awardRows = checkpointIds.length
    ? await database
        .select()
        .from(schema.checkpointAwards)
        .where(inArray(schema.checkpointAwards.checkpointId, checkpointIds))
    : [];
  const awardByCheckpoint = new Map(
    awardRows.map((award) => [award.checkpointId, award]),
  );

  const dashboardHabits = habitRows.map((habit): DashboardHabit => {
    const targets = targetRows
      .filter((target) => target.habitId === habit.id)
      .map(toTarget);
    const allCheckins = checkinRows
      .filter((checkin) => checkin.habitId === habit.id)
      .map(toCheckin);
    const checkins = allCheckins.filter((checkin) => checkin.localDate >= from);
    const stats = calculateHabitStats({
      habitStartDate: habit.startDate,
      today,
      targets,
      checkins: allCheckins,
    });
    const checkpoints = checkpointRows
      .filter((checkpoint) => checkpoint.habitId === habit.id)
      .map((row) => {
        const checkpoint = toCheckpoint(row);
        const evaluation = evaluateCheckpoint(checkpoint, stats);
        const award = awardByCheckpoint.get(checkpoint.id);
        return {
          ...checkpoint,
          progress: evaluation.progress,
          isEarned: Boolean(award),
          earnedAt: award?.earnedAt.toISOString() ?? null,
        };
      });
    const next = checkpoints.find((checkpoint) => !checkpoint.isEarned);
    const todayTarget = targetForDate(targets, today);
    const todayValue = todayTarget
      ? progressForTargetPeriod(todayTarget, today, allCheckins)
      : 0;

    return {
      habit: {
        id: habit.id,
        name: habit.name,
        description: habit.description,
        icon: habit.icon,
        accentToken: habit.accentToken,
        startDate: habit.startDate,
        sortOrder: habit.sortOrder,
      },
      targets,
      checkins,
      checkpoints,
      heatmap: buildHeatmap({
        startDate: from,
        endDate: to,
        today,
        targets,
        checkins: allCheckins,
      }),
      stats,
      todayValue,
      nextCheckpoint: next
        ? {
            id: next.id,
            title: next.title,
            rewardDescription: next.rewardDescription,
            progress: next.progress,
            thresholdValue: next.thresholdValue,
          }
        : null,
    };
  });

  return { habits: dashboardHabits };
}

async function ownedHabitWithUser(
  database: HabitDatabase,
  userId: string,
  habitId: string,
) {
  const [result] = await database
    .select({ habit: schema.habits, timezone: schema.users.timezone })
    .from(schema.habits)
    .innerJoin(schema.users, eq(schema.users.id, schema.habits.userId))
    .where(and(eq(schema.habits.id, habitId), eq(schema.habits.userId, userId)))
    .limit(1);
  if (!result) {
    throw new ServiceError("NOT_FOUND", "Habit was not found");
  }
  return result;
}

export async function upsertCheckin(
  database: HabitDatabase,
  {
    userId,
    habitId,
    localDate,
    input: untrustedInput,
    now = new Date(),
  }: {
    userId: string;
    habitId: string;
    localDate: string;
    input: unknown;
    now?: Date;
  },
) {
  if (!isValidLocalDate(localDate)) {
    throw new ServiceError("VALIDATION_ERROR", "Check-in date is invalid");
  }
  const parsed = upsertCheckinInputSchema.safeParse(untrustedInput);
  if (!parsed.success) {
    throw new ServiceError("VALIDATION_ERROR", "Check-in is invalid", {
      details: parsed.error.flatten(),
    });
  }
  const input = parsed.data;
  const { habit, timezone } = await ownedHabitWithUser(database, userId, habitId);
  const today = todayInTimeZone(timezone, now);
  if (localDate < habit.startDate || localDate > today) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Check-ins must be between the habit start date and today",
    );
  }

  const targets = (
    await database
      .select()
      .from(schema.habitTargets)
      .where(eq(schema.habitTargets.habitId, habitId))
      .orderBy(asc(schema.habitTargets.effectiveFrom))
  ).map(toTarget);
  const target = targetForDate(targets, localDate);
  if (!target) {
    throw new ServiceError("CONFLICT", "No target applies to this date");
  }

  return database.transaction(async (transaction) => {
    if (input.value === 0 && !input.isSkipped && !input.note) {
      await transaction
        .delete(schema.habitCheckins)
        .where(
          and(
            eq(schema.habitCheckins.habitId, habitId),
            eq(schema.habitCheckins.localDate, localDate),
          ),
        );
      return { checkin: null, newAwards: [] as schema.CheckpointAwardRow[] };
    }

    const [checkin] = await transaction
      .insert(schema.habitCheckins)
      .values({
        habitId,
        targetId: target.id,
        localDate,
        value: input.value,
        isSkipped: input.isSkipped,
        note: input.note,
        checkedAt: input.value > 0 ? now : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.habitCheckins.habitId, schema.habitCheckins.localDate],
        set: {
          targetId: target.id,
          value: input.value,
          isSkipped: input.isSkipped,
          note: input.note,
          checkedAt: input.value > 0 ? now : null,
          updatedAt: now,
        },
      })
      .returning();

    const [allEntryRows, checkpointRows, existingAwards] = await Promise.all([
      transaction
        .select()
        .from(schema.habitCheckins)
        .where(eq(schema.habitCheckins.habitId, habitId)),
      transaction
        .select()
        .from(schema.habitCheckpoints)
        .where(eq(schema.habitCheckpoints.habitId, habitId))
        .orderBy(asc(schema.habitCheckpoints.sortOrder)),
      transaction
        .select({ checkpointId: schema.checkpointAwards.checkpointId })
        .from(schema.checkpointAwards)
        .innerJoin(
          schema.habitCheckpoints,
          eq(schema.habitCheckpoints.id, schema.checkpointAwards.checkpointId),
        )
        .where(eq(schema.habitCheckpoints.habitId, habitId)),
    ]);

    const stats = calculateHabitStats({
      habitStartDate: habit.startDate,
      today,
      targets,
      checkins: allEntryRows.map(toCheckin),
    });
    const awardedIds = new Set(existingAwards.map(({ checkpointId }) => checkpointId));
    const newAwards: schema.CheckpointAwardRow[] = [];

    for (const checkpointRow of checkpointRows) {
      if (awardedIds.has(checkpointRow.id)) continue;
      const result = evaluateCheckpoint(toCheckpoint(checkpointRow), stats);
      if (!result.isEarned) continue;
      const [award] = await transaction
        .insert(schema.checkpointAwards)
        .values({
          checkpointId: checkpointRow.id,
          triggerCheckinId: checkin.id,
          progressSnapshot: result.progress,
          earnedAt: now,
        })
        .onConflictDoNothing({ target: schema.checkpointAwards.checkpointId })
        .returning();
      if (award) newAwards.push(award);
    }

    return { checkin, newAwards };
  });
}

export async function getLatestHabitCheckins(
  database: HabitDatabase,
  userId: string,
  habitId: string,
) {
  await ownedHabitWithUser(database, userId, habitId);
  return database
    .select()
    .from(schema.habitCheckins)
    .where(eq(schema.habitCheckins.habitId, habitId))
    .orderBy(desc(schema.habitCheckins.localDate));
}
