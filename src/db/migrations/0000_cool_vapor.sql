CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "public"."accent_token" AS ENUM('emerald', 'azure', 'amber', 'violet', 'rose');--> statement-breakpoint
CREATE TYPE "public"."checkpoint_metric" AS ENUM('completed_periods', 'current_streak', 'total_value');--> statement-breakpoint
CREATE TYPE "public"."habit_cadence" AS ENUM('daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."habit_metric" AS ENUM('binary', 'count', 'duration');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkpoint_awards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkpoint_id" uuid NOT NULL,
	"trigger_checkin_id" uuid,
	"progress_snapshot" numeric(12, 2) NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habit_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"value" numeric(12, 2) DEFAULT 0 NOT NULL,
	"is_skipped" boolean DEFAULT false NOT NULL,
	"note" varchar(2000),
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_checkins_value_non_negative" CHECK ("habit_checkins"."value" >= 0),
	CONSTRAINT "habit_checkins_skipped_zero" CHECK (not "habit_checkins"."is_skipped" or "habit_checkins"."value" = 0)
);
--> statement-breakpoint
CREATE TABLE "habit_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"title" varchar(80) NOT NULL,
	"metric" "checkpoint_metric" NOT NULL,
	"threshold_value" numeric(12, 2) NOT NULL,
	"reward_description" varchar(500) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_checkpoints_threshold_positive" CHECK ("habit_checkpoints"."threshold_value" > 0)
);
--> statement-breakpoint
CREATE TABLE "habit_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"metric" "habit_metric" NOT NULL,
	"target_value" numeric(12, 2) NOT NULL,
	"unit" varchar(32),
	"cadence" "habit_cadence" NOT NULL,
	"scheduled_weekdays" smallint[],
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_targets_value_positive" CHECK ("habit_targets"."target_value" > 0),
	CONSTRAINT "habit_targets_valid_range" CHECK ("habit_targets"."effective_to" is null or "habit_targets"."effective_to" >= "habit_targets"."effective_from"),
	CONSTRAINT "habit_targets_binary_shape" CHECK ("habit_targets"."metric" <> 'binary' or ("habit_targets"."target_value" = 1 and "habit_targets"."unit" is null))
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(500),
	"icon" varchar(32) NOT NULL,
	"accent_token" "accent_token" NOT NULL,
	"start_date" date NOT NULL,
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"timezone" varchar(80) DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_awards" ADD CONSTRAINT "checkpoint_awards_checkpoint_id_habit_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."habit_checkpoints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkpoint_awards" ADD CONSTRAINT "checkpoint_awards_trigger_checkin_id_habit_checkins_id_fk" FOREIGN KEY ("trigger_checkin_id") REFERENCES "public"."habit_checkins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_target_id_habit_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."habit_targets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkpoints" ADD CONSTRAINT "habit_checkpoints_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_targets" ADD CONSTRAINT "habit_targets_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkpoint_awards_checkpoint_unique" ON "checkpoint_awards" USING btree ("checkpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_checkins_habit_date_unique" ON "habit_checkins" USING btree ("habit_id","local_date");--> statement-breakpoint
CREATE INDEX "habit_checkins_habit_date_idx" ON "habit_checkins" USING btree ("habit_id","local_date");--> statement-breakpoint
CREATE INDEX "habit_checkpoints_habit_sort_idx" ON "habit_checkpoints" USING btree ("habit_id","sort_order");--> statement-breakpoint
CREATE INDEX "habit_targets_habit_dates_idx" ON "habit_targets" USING btree ("habit_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_targets_open_ended_unique" ON "habit_targets" USING btree ("habit_id") WHERE "habit_targets"."effective_to" is null;--> statement-breakpoint
ALTER TABLE "habit_targets" ADD CONSTRAINT "habit_targets_no_overlap" EXCLUDE USING gist (
	"habit_id" WITH =,
	daterange("effective_from", COALESCE("effective_to", 'infinity'::date), '[]') WITH &&
);--> statement-breakpoint
CREATE INDEX "habits_user_active_sort_idx" ON "habits" USING btree ("user_id","sort_order") WHERE "habits"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
