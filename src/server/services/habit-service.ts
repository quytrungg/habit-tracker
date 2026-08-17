import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  max,
} from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { eachDayOfInterval, format, getISODay, parseISO } from "date-fns";

import * as schema from "@/db/schema";
import {
  buildHeatmap,
  calculateHabitXp,
  calculateHabitStats,
  evaluateCheckpoint,
  isScheduled,
  isValidLocalDate,
  hourInTimeZone,
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

const totalXp = (awards: Map<string, number>) =>
  [...awards.values()].reduce((total, xp) => total + xp, 0);

const toTarget = (row: schema.HabitTargetRow): HabitTarget => ({
  id: row.id,
  habitId: row.habitId,
  metric: row.metric,
  targetValue: row.targetValue,
  unit: row.unit,
  cadence: row.cadence,
  scheduledWeekdays: row.scheduledWeekdays,
  scheduledHours: row.scheduledHours,
  effectiveFrom: row.effectiveFrom,
  effectiveTo: row.effectiveTo,
});

const toCheckin = (row: schema.HabitCheckinRow): Checkin => ({
  id: row.id,
  habitId: row.habitId,
  targetId: row.targetId,
  localDate: row.localDate,
  localHour: row.localHour,
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
    const [activeHabits] = await transaction
      .select({ value: count() })
      .from(schema.habits)
      .where(
        and(
          eq(schema.habits.userId, userId),
          isNull(schema.habits.archivedAt),
        ),
      );
    if (Number(activeHabits?.value ?? 0) >= 5) {
      throw new ServiceError(
        "CONFLICT",
        "Free plan includes up to 5 active habits. Archive a habit or choose Boost to create more.",
      );
    }

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
        customColor: input.customColor,
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
        scheduledHours: input.target.scheduledHours,
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
        scheduledHours: input.target.scheduledHours,
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
        scheduledHours: input.target.scheduledHours,
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
  localHour: number | null = null,
) {
  if (!isValidLocalDate(localDate)) {
    throw new ServiceError("VALIDATION_ERROR", "Check-in date is invalid");
  }
  await ownedHabitWithUser(database, userId, habitId);
  const targets = (
    await database
      .select()
      .from(schema.habitTargets)
      .where(eq(schema.habitTargets.habitId, habitId))
      .orderBy(asc(schema.habitTargets.effectiveFrom))
  ).map(toTarget);
  const target = targetForDate(targets, localDate);
  if (!target) throw new ServiceError("CONFLICT", "No target applies to this date");
  if (target.cadence === "hourly") {
    if (
      typeof localHour !== "number" ||
      !Number.isInteger(localHour) ||
      localHour < 0 ||
      localHour > 23
    ) {
      throw new ServiceError("VALIDATION_ERROR", "Hourly check-in hour is invalid");
    }
  } else if (localHour !== null) {
    throw new ServiceError("VALIDATION_ERROR", "This habit does not use hourly check-ins");
  }
  const hourSlot = localHour as number;
  const [deleted] = await database
    .delete(schema.habitCheckins)
    .where(
      and(
        eq(schema.habitCheckins.habitId, habitId),
        eq(schema.habitCheckins.localDate, localDate),
        target.cadence === "hourly"
          ? eq(schema.habitCheckins.localHour, hourSlot)
          : isNull(schema.habitCheckins.localHour),
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
    | "customColor"
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

export type XpHistoryPoint = {
  date: string;
  earnedXp: number;
  totalXp: number;
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
    .where(eq(schema.habits.userId, userId))
    .orderBy(asc(schema.habits.sortOrder), asc(schema.habits.createdAt));

  if (!habitRows.length) {
    return {
      habits: [] as DashboardHabit[],
      archivedHabits: [] as DashboardHabit[],
      totalXp: 0,
      xpHistory: [] as XpHistoryPoint[],
    };
  }
  const activeHabitRows = habitRows.filter((habit) => habit.archivedAt === null);
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

  const xpByDate = new Map<string, number>();
  const earnedXp = habitRows.reduce((total, habit) => {
    const targets = targetRows
      .filter((target) => target.habitId === habit.id)
      .map(toTarget);
    const checkins = checkinRows
      .filter((checkin) => checkin.habitId === habit.id)
      .map(toCheckin);
    const awards = calculateHabitXp(targets, checkins);
    for (const checkin of checkins) {
      const xp = awards.get(checkin.id) ?? 0;
      xpByDate.set(checkin.localDate, (xpByDate.get(checkin.localDate) ?? 0) + xp);
    }
    return total + totalXp(awards);
  }, 0);
  const historyEnd = to < today ? to : today;
  const historyStart = habitRows.reduce(
    (earliest, habit) => (habit.startDate < earliest ? habit.startDate : earliest),
    habitRows[0].startDate,
  );
  let runningXp = 0;
  const xpHistory: XpHistoryPoint[] =
    historyStart > historyEnd
      ? []
      : eachDayOfInterval({
          start: parseISO(`${historyStart}T12:00:00`),
          end: parseISO(`${historyEnd}T12:00:00`),
        }).map((date) => {
          const localDate = format(date, "yyyy-MM-dd");
          const earnedXp = xpByDate.get(localDate) ?? 0;
          runningXp += earnedXp;
          return { date: localDate, earnedXp, totalXp: runningXp };
        });
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
        customColor: habit.customColor,
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

  return {
    habits: dashboardHabits.filter((item) =>
      activeHabitRows.some((habit) => habit.id === item.habit.id),
    ),
    archivedHabits: dashboardHabits.filter((item) =>
      !activeHabitRows.some((habit) => habit.id === item.habit.id),
    ),
    totalXp: earnedXp,
    xpHistory,
  };
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
  if (target.cadence === "hourly" && localDate !== today) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "Hourly check-ins can only be recorded for the current day",
    );
  }
  const localHour = target.cadence === "hourly" ? hourInTimeZone(timezone, now) : null;
  if (
    target.cadence === "hourly" &&
    !isScheduled(target, localDate, localHour ?? undefined)
  ) {
    throw new ServiceError(
      "VALIDATION_ERROR",
      "This habit is not scheduled for the current hour",
    );
  }

  return database.transaction(async (transaction) => {
    const entryRowsBefore = await transaction
      .select()
      .from(schema.habitCheckins)
      .where(eq(schema.habitCheckins.habitId, habitId));
    const xpBefore = totalXp(calculateHabitXp(targets, entryRowsBefore.map(toCheckin)));
    const slotMatches = (entry: schema.HabitCheckinRow) =>
      entry.localDate === localDate && entry.localHour === localHour;
    const existing = entryRowsBefore.find(slotMatches);

    if (input.value === 0 && !input.isSkipped && !input.note) {
      await transaction
        .delete(schema.habitCheckins)
        .where(
          and(
            eq(schema.habitCheckins.habitId, habitId),
            eq(schema.habitCheckins.localDate, localDate),
            localHour === null
              ? isNull(schema.habitCheckins.localHour)
              : eq(schema.habitCheckins.localHour, localHour),
          ),
        );
      const entriesAfter = entryRowsBefore.filter((entry) => !slotMatches(entry));
      return {
        checkin: null,
        newAwards: [] as schema.CheckpointAwardRow[],
        xpDelta: totalXp(calculateHabitXp(targets, entriesAfter.map(toCheckin))) - xpBefore,
      };
    }

    const values = {
        habitId,
        targetId: target.id,
        localDate,
        localHour,
        value: input.value,
        isSkipped: input.isSkipped,
        note: input.note,
        checkedAt: input.value > 0 ? now : null,
        updatedAt: now,
      };
    const [checkin] = existing
      ? await transaction
          .update(schema.habitCheckins)
          .set(values)
          .where(eq(schema.habitCheckins.id, existing.id))
          .returning()
      : await transaction.insert(schema.habitCheckins).values(values).returning();

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
    const xpDelta = totalXp(calculateHabitXp(targets, allEntryRows.map(toCheckin))) - xpBefore;
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

    return { checkin, newAwards, xpDelta };
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
