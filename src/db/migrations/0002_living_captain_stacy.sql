ALTER TYPE "public"."habit_cadence" ADD VALUE IF NOT EXISTS 'hourly' BEFORE 'daily';--> statement-breakpoint
DROP INDEX IF EXISTS "habit_checkins_habit_date_unique";--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD COLUMN IF NOT EXISTS "local_hour" smallint;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "habit_checkins_daily_date_unique" ON "habit_checkins" USING btree ("habit_id","local_date") WHERE "habit_checkins"."local_hour" is null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "habit_checkins_hourly_date_hour_unique" ON "habit_checkins" USING btree ("habit_id","local_date","local_hour") WHERE "habit_checkins"."local_hour" is not null;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_valid_local_hour" CHECK ("habit_checkins"."local_hour" is null or ("habit_checkins"."local_hour" >= 0 and "habit_checkins"."local_hour" <= 23));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
