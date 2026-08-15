export type HabitMetric = "binary" | "count" | "duration";
export type HabitCadence = "daily" | "weekly";
export type CheckpointMetric =
  | "completed_periods"
  | "current_streak"
  | "total_value";

export type AccentToken = "emerald" | "azure" | "amber" | "violet" | "rose";

export type HabitTarget = {
  id: string;
  habitId: string;
  metric: HabitMetric;
  targetValue: number;
  unit: string | null;
  cadence: HabitCadence;
  scheduledWeekdays: number[] | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type Checkin = {
  id: string;
  habitId: string;
  targetId: string;
  localDate: string;
  value: number;
  isSkipped: boolean;
  note: string | null;
};

export type Checkpoint = {
  id: string;
  habitId: string;
  title: string;
  metric: CheckpointMetric;
  thresholdValue: number;
  rewardDescription: string;
  sortOrder: number;
};

export type HabitStats = {
  currentStreak: number;
  longestStreak: number;
  completedPeriods: number;
  totalValue: number;
  streakUnit: "days" | "weeks";
};

export type HeatmapState =
  | "future"
  | "unscheduled"
  | "missing"
  | "note-only"
  | "partial"
  | "complete"
  | "skipped";

export type HeatmapCell = {
  date: string;
  state: HeatmapState;
  value: number;
  targetValue: number | null;
  intensity: 0 | 1 | 2 | 3 | 4;
  hasNote: boolean;
  label: string;
};

export type Habit = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  icon: string;
  accentToken: AccentToken;
  startDate: string;
  archivedAt: Date | null;
  sortOrder: number;
};

export type CheckpointAward = {
  id: string;
  checkpointId: string;
  triggerCheckinId: string | null;
  progressSnapshot: number;
  earnedAt: Date;
};
