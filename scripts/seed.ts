import { eachDayOfInterval, format, subDays } from "date-fns";
import { eq } from "drizzle-orm";

import { closeDatabase, db } from "../src/db/connection";
import {
  habitCheckins,
  users,
} from "../src/db/schema";
import { todayInTimeZone } from "../src/domain/habit-engine";
import {
  registerUser,
} from "../src/server/services/auth-service";
import {
  createHabit,
  upsertCheckin,
} from "../src/server/services/habit-service";

const DEMO_EMAIL = "demo@ember.local";
const DEMO_PASSWORD = "ember-demo-2026";
const TIMEZONE = "Asia/Ho_Chi_Minh";

const [existingUser] = await db
  .select()
  .from(users)
  .where(eq(users.email, DEMO_EMAIL))
  .limit(1);
const user =
  existingUser ??
  (await registerUser(db, {
    displayName: "Mai",
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    timezone: TIMEZONE,
  }));

const [existingHabit] = await db.query.habits.findMany({
  where: (habits, { eq }) => eq(habits.userId, user.id),
  limit: 1,
});

if (!existingHabit) {
  const today = todayInTimeZone(TIMEZONE);
  const todayDate = new Date(`${today}T12:00:00Z`);
  const startDate = format(subDays(todayDate, 181), "yyyy-MM-dd");
  const days = eachDayOfInterval({
    start: new Date(`${startDate}T12:00:00Z`),
    end: subDays(todayDate, 1),
  });

  const study = await createHabit(db, user.id, {
    name: "Study",
    description: "One focused session before the day gets noisy.",
    icon: "📚",
    accentToken: "emerald",
    startDate,
    target: {
      metric: "binary",
      targetValue: 1,
      unit: null,
      cadence: "daily",
      scheduledWeekdays: null,
    },
    checkpoints: [
      {
        title: "First week",
        metric: "completed_periods",
        thresholdValue: 7,
        rewardDescription: "Choose a new book",
      },
      {
        title: "Deep roots",
        metric: "completed_periods",
        thresholdValue: 120,
        rewardDescription: "Create a quiet reading corner",
      },
    ],
  });
  const water = await createHabit(db, user.id, {
    name: "Drink water",
    description: "Eight glasses, spaced gently through the day.",
    icon: "💧",
    accentToken: "azure",
    startDate,
    target: {
      metric: "count",
      targetValue: 8,
      unit: "glasses",
      cadence: "daily",
      scheduledWeekdays: null,
    },
    checkpoints: [
      {
        title: "Hydration groove",
        metric: "completed_periods",
        thresholdValue: 30,
        rewardDescription: "Buy a favorite tea",
      },
    ],
  });
  const exercise = await createHabit(db, user.id, {
    name: "Morning exercise",
    description: "Move before opening the inbox.",
    icon: "🏃",
    accentToken: "amber",
    startDate,
    target: {
      metric: "duration",
      targetValue: 30,
      unit: "minutes",
      cadence: "daily",
      scheduledWeekdays: [1, 3, 5],
    },
    checkpoints: [
      {
        title: "Twelve mornings",
        metric: "completed_periods",
        thresholdValue: 12,
        rewardDescription: "Book a recovery massage",
      },
    ],
  });

  const rows = days.flatMap((day, index) => {
    const localDate = format(day, "yyyy-MM-dd");
    const isoDay = day.getUTCDay() === 0 ? 7 : day.getUTCDay();
    const shared = {
      localDate,
      checkedAt: new Date(`${localDate}T05:00:00Z`),
    };
    const entries = [];
    if ((index * 7) % 10 < 7) {
      entries.push({
        ...shared,
        habitId: study.habit.id,
        targetId: study.target.id,
        value: 1,
        isSkipped: false,
        note: index % 19 === 0 ? "Found a good, quiet hour." : null,
      });
    }
    const waterValue = 4 + ((index * 3) % 5);
    entries.push({
      ...shared,
      habitId: water.habit.id,
      targetId: water.target.id,
      value: waterValue,
      isSkipped: false,
      note: index % 23 === 0 ? "Carried the blue bottle today." : null,
    });
    if ([1, 3, 5].includes(isoDay) && index % 5 !== 0) {
      entries.push({
        ...shared,
        habitId: exercise.habit.id,
        targetId: exercise.target.id,
        value: index % 4 === 0 ? 20 : index % 3 === 0 ? 45 : 30,
        isSkipped: false,
        note: index % 29 === 0 ? "Easy pace, good energy." : null,
      });
    }
    return entries;
  });
  if (rows.length) await db.insert(habitCheckins).values(rows).onConflictDoNothing();

  for (const seeded of [study, water, exercise]) {
    await upsertCheckin(db, {
      userId: user.id,
      habitId: seeded.habit.id,
      localDate: today,
      input: {
        value:
          seeded.target.metric === "binary" ? 1 : seeded.target.targetValue,
        isSkipped: false,
        note: "Seeded demo check-in",
      },
      now: new Date(),
    });
  }
}

console.log(`Demo account ready: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
await closeDatabase();
