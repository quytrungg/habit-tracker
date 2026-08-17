DO $$ BEGIN
  ALTER TYPE "public"."accent_token" ADD VALUE 'teal';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."accent_token" ADD VALUE 'indigo';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."accent_token" ADD VALUE 'lime';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."accent_token" ADD VALUE 'coral';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "public"."accent_token" ADD VALUE 'fuchsia';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN IF NOT EXISTS "custom_color" varchar(7);
