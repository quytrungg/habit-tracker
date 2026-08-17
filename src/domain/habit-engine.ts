import {
  addDays,
  compareAsc,
  eachDayOfInterval,
  endOfWeek,
  format,
  getISODay,
  isAfter,
  isBefore,
  max,
  min,
  parseISO,
  startOfWeek,
} from "date-fns";

import type {
  Checkin,
  Checkpoint,
  HabitStats,
  HabitTarget,
  HeatmapCell,
  HeatmapState,
} from "./types";

const ISO_DATE = "yyyy-MM-dd";

const fromLocalDate = (date: string) => parseISO(`${date}T12:00:00`);
const toLocalDate = (date: Date) => format(date, ISO_DATE);

const compareLocalDates = (left: string, right: string) =>
  compareAsc(fromLocalDate(left), fromLocalDate(right));

export function targetForDate(
  targets: HabitTarget[],
  localDate: string,
): HabitTarget | undefined {
  return targets
    .filter(
      (target) =>
        compareLocalDates(target.effectiveFrom, localDate) <= 0 &&
        (target.effectiveTo === null ||
          compareLocalDates(target.effectiveTo, localDate) >= 0),
    )
    .sort((left, right) =>
      compareLocalDates(right.effectiveFrom, left.effectiveFrom),
    )[0];
}

export function isScheduled(
  target: HabitTarget,
  localDate: string,
  localHour?: number,
) {
  if (target.cadence === "weekly") return true;
  if (target.cadence === "hourly") {
    return (
      !target.scheduledHours?.length ||
      localHour === undefined ||
      target.scheduledHours.includes(localHour)
    );
  }
  if (!target.scheduledWeekdays?.length) return true;
  return target.scheduledWeekdays.includes(getISODay(fromLocalDate(localDate)));
}

function datesBetween(startDate: string, endDate: string) {
  if (compareLocalDates(startDate, endDate) > 0) return [];
  return eachDayOfInterval({
    start: fromLocalDate(startDate),
    end: fromLocalDate(endDate),
  }).map(toLocalDate);
}

function valueForEntry(entry: Checkin | undefined) {
  return entry && !entry.isSkipped ? entry.value : 0;
}

function weekBounds(localDate: string) {
  const date = fromLocalDate(localDate);
  return {
    start: toLocalDate(startOfWeek(date, { weekStartsOn: 1 })),
    end: toLocalDate(endOfWeek(date, { weekStartsOn: 1 })),
  };
}

function weeklyValue(
  target: HabitTarget,
  localDate: string,
  checkins: Checkin[],
) {
  const { start, end } = weekBounds(localDate);
  return checkins.reduce((sum, entry) => {
    const isInWeek =
      compareLocalDates(entry.localDate, start) >= 0 &&
      compareLocalDates(entry.localDate, end) <= 0;
    return isInWeek && entry.targetId === target.id
      ? sum + valueForEntry(entry)
      : sum;
  }, 0);
}

function hourlyValue(
  target: HabitTarget,
  localDate: string,
  checkins: Checkin[],
) {
  return checkins.reduce(
    (sum, entry) =>
      entry.localDate === localDate && entry.targetId === target.id
        ? sum + valueForEntry(entry)
        : sum,
    0,
  );
}

export function progressForTargetPeriod(
  target: HabitTarget,
  localDate: string,
  checkins: Checkin[],
) {
  if (target.cadence === "weekly") {
    return weeklyValue(target, localDate, checkins);
  }
  if (target.cadence === "hourly") {
    return hourlyValue(target, localDate, checkins);
  }
  return valueForEntry(
    checkins.find(
      (entry) =>
        entry.localDate === localDate && entry.targetId === target.id,
    ),
  );
}

/**
 * The XP available for completing one target period. More frequent daily habits
 * require more sustained effort; a weekly target has the largest single pool.
 */
export function baseXpForTarget(target: HabitTarget) {
  if (target.cadence === "hourly") return 4;
  if (target.cadence === "weekly") return 30;

  const scheduledDays = target.scheduledWeekdays?.length ?? 7;
  return 8 + scheduledDays * 2;
}

function allocatePeriodXp(target: HabitTarget, entries: Checkin[]) {
  const awards = new Map<string, number>();
  const baseXp = baseXpForTarget(target);
  let progress = 0;

  for (const entry of [...entries].sort(
    (left, right) =>
      compareLocalDates(left.localDate, right.localDate) || left.id.localeCompare(right.id),
  )) {
    const before = Math.min(progress, target.targetValue);
    progress += valueForEntry(entry);
    const after = Math.min(progress, target.targetValue);
    awards.set(
      entry.id,
      Math.floor((after / target.targetValue) * baseXp) -
        Math.floor((before / target.targetValue) * baseXp),
    );
  }

  return awards;
}

/**
 * Awards XP in integer increments as progress accumulates toward each target.
 * Quantity and duration habits therefore earn more XP as the check-in gets
 * closer to their target, while a completed period receives its full pool.
 */
export function calculateHabitXp(targets: HabitTarget[], checkins: Checkin[]) {
  const awards = new Map<string, number>();

  for (const target of targets) {
    const targetEntries = checkins.filter(
      (entry) => entry.targetId === target.id,
    );
    if (target.cadence === "daily" || target.cadence === "hourly") {
      for (const entry of targetEntries) {
        if (
          !isScheduled(target, entry.localDate, entry.localHour ?? undefined)
        ) {
          awards.set(entry.id, 0);
          continue;
        }
        for (const [id, xp] of allocatePeriodXp(target, [entry])) awards.set(id, xp);
      }
      continue;
    }

    const byWeek = new Map<string, Checkin[]>();
    for (const entry of targetEntries) {
      const { start } = weekBounds(entry.localDate);
      const entries = byWeek.get(start) ?? [];
      entries.push(entry);
      byWeek.set(start, entries);
    }
    for (const entries of byWeek.values()) {
      for (const [id, xp] of allocatePeriodXp(target, entries)) awards.set(id, xp);
    }
  }

  return awards;
}

function heatmapState({
  entry,
  target,
  checkins,
}: {
  entry: Checkin | undefined;
  target: HabitTarget;
  checkins: Checkin[];
}): HeatmapState {
  if (!entry) return "missing";
  if (target.cadence === "hourly") {
    const entries = checkins.filter(
      (candidate) =>
        candidate.localDate === entry.localDate && candidate.targetId === target.id,
    );
    const value = hourlyValue(target, entry.localDate, checkins);
    if (value > 0) return value >= target.targetValue ? "complete" : "partial";
    if (entries.every((candidate) => candidate.isSkipped)) return "skipped";
    return entries.some((candidate) => candidate.note?.trim())
      ? "note-only"
      : "missing";
  }
  if (entry.isSkipped) return "skipped";
  if (entry.value <= 0) return entry.note ? "note-only" : "missing";
  if (target.cadence === "weekly") {
    return weeklyValue(target, entry.localDate, checkins) >= target.targetValue
      ? "complete"
      : "partial";
  }
  return entry.value >= target.targetValue ? "complete" : "partial";
}

function intensityFor(value: number, targetValue: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || targetValue <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / targetValue) * 4))) as
    | 1
    | 2
    | 3
    | 4;
}

function cellLabel(
  date: string,
  state: HeatmapState,
  value: number,
  target: HabitTarget | undefined,
  hasNote: boolean,
) {
  const dateLabel = new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  const progress = target
    ? `${value} of ${target.targetValue}${target.unit ? ` ${target.unit}` : ""}`
    : state;
  return `${dateLabel}, ${progress}${hasNote ? ", note added" : ""}`;
}

export function buildHeatmap({
  startDate,
  endDate,
  today,
  targets,
  checkins,
}: {
  startDate: string;
  endDate: string;
  today: string;
  targets: HabitTarget[];
  checkins: Checkin[];
}): HeatmapCell[] {
  const entriesByDate = new Map<string, Checkin[]>();
  for (const entry of checkins) {
    const entries = entriesByDate.get(entry.localDate) ?? [];
    entries.push(entry);
    entriesByDate.set(entry.localDate, entries);
  }

  return datesBetween(startDate, endDate).map((date) => {
    const target = targetForDate(targets, date);
    const entries = entriesByDate.get(date) ?? [];
    const entry = entries.at(-1);
    const value =
      target?.cadence === "hourly"
        ? hourlyValue(target, date, checkins)
        : valueForEntry(entry);
    const hasNote = entries.some((candidate) => Boolean(candidate.note?.trim()));
    let state: HeatmapState;

    if (compareLocalDates(date, today) > 0) state = "future";
    else if (!target || !isScheduled(target, date)) state = "unscheduled";
    else state = heatmapState({ entry, target, checkins });

    return {
      date,
      state,
      value,
      targetValue: target?.targetValue ?? null,
      intensity: target ? intensityFor(value, target.targetValue) : 0,
      hasNote,
      label: cellLabel(date, state, value, target, hasNote),
    };
  });
}

type HabitPeriod = {
  key: string;
  start: string;
  end: string;
  target: HabitTarget;
};

function buildPeriods({
  habitStartDate,
  today,
  targets,
}: {
  habitStartDate: string;
  today: string;
  targets: HabitTarget[];
}): HabitPeriod[] {
  const periods = new Map<string, HabitPeriod>();

  for (const date of datesBetween(habitStartDate, today)) {
    const target = targetForDate(targets, date);
    if (!target) continue;

    if (target.cadence === "daily" || target.cadence === "hourly") {
      if (isScheduled(target, date)) {
        periods.set(`day:${date}`, { key: date, start: date, end: date, target });
      }
      continue;
    }

    const bounds = weekBounds(date);
    const key = `week:${bounds.start}:${target.id}`;
    if (!periods.has(key)) {
      const start = toLocalDate(
        max([
          fromLocalDate(bounds.start),
          fromLocalDate(habitStartDate),
          fromLocalDate(target.effectiveFrom),
        ]),
      );
      const endCandidates = [fromLocalDate(bounds.end)];
      if (target.effectiveTo) endCandidates.push(fromLocalDate(target.effectiveTo));
      periods.set(key, {
        key: bounds.start,
        start,
        end: toLocalDate(min(endCandidates)),
        target,
      });
    }
  }

  return [...periods.values()].sort((left, right) =>
    compareLocalDates(left.start, right.start),
  );
}

function periodIsComplete(period: HabitPeriod, checkins: Checkin[]) {
  if (period.target.cadence === "daily") {
    const entry = checkins.find(
      (candidate) =>
        candidate.localDate === period.start &&
        candidate.targetId === period.target.id,
    );
    return valueForEntry(entry) >= period.target.targetValue;
  }

  if (period.target.cadence === "hourly") {
    return hourlyValue(period.target, period.start, checkins) >= period.target.targetValue;
  }

  const value = checkins.reduce((sum, entry) => {
    const isInPeriod =
      compareLocalDates(entry.localDate, period.start) >= 0 &&
      compareLocalDates(entry.localDate, period.end) <= 0 &&
      entry.targetId === period.target.id;
    return isInPeriod ? sum + valueForEntry(entry) : sum;
  }, 0);
  return value >= period.target.targetValue;
}

export function calculateHabitStats({
  habitStartDate,
  today,
  targets,
  checkins,
}: {
  habitStartDate: string;
  today: string;
  targets: HabitTarget[];
  checkins: Checkin[];
}): HabitStats {
  const periods = buildPeriods({ habitStartDate, today, targets });
  const completion = periods.map((period) => periodIsComplete(period, checkins));
  const currentTarget = targetForDate(targets, today) ?? targets.at(-1);

  let longestStreak = 0;
  let runningStreak = 0;
  for (const isComplete of completion) {
    runningStreak = isComplete ? runningStreak + 1 : 0;
    longestStreak = Math.max(longestStreak, runningStreak);
  }

  let cursor = periods.length - 1;
  const latest = periods[cursor];
  if (
    latest &&
    !completion[cursor] &&
    compareLocalDates(latest.end, today) >= 0
  ) {
    cursor -= 1;
  }

  let currentStreak = 0;
  while (cursor >= 0 && completion[cursor]) {
    currentStreak += 1;
    cursor -= 1;
  }

  return {
    currentStreak,
    longestStreak,
    completedPeriods: completion.filter(Boolean).length,
    totalValue: checkins.reduce(
      (sum, checkin) => sum + valueForEntry(checkin),
      0,
    ),
    streakUnit: currentTarget?.cadence === "weekly" ? "weeks" : "days",
  };
}

export function evaluateCheckpoint(
  checkpoint: Checkpoint,
  stats: HabitStats,
) {
  const progress =
    checkpoint.metric === "completed_periods"
      ? stats.completedPeriods
      : checkpoint.metric === "current_streak"
        ? stats.currentStreak
        : stats.totalValue;
  return { progress, isEarned: progress >= checkpoint.thresholdValue };
}

export function todayInTimeZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function hourInTimeZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(value.hour);
}

export function previousLocalDate(localDate: string) {
  return toLocalDate(addDays(fromLocalDate(localDate), -1));
}

export function nextLocalDate(localDate: string) {
  return toLocalDate(addDays(fromLocalDate(localDate), 1));
}

export function isValidLocalDate(localDate: string) {
  const parsed = fromLocalDate(localDate);
  return (
    !Number.isNaN(parsed.getTime()) &&
    toLocalDate(parsed) === localDate &&
    !isBefore(parsed, fromLocalDate("1900-01-01")) &&
    !isAfter(parsed, fromLocalDate("2200-12-31"))
  );
}
