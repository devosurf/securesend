CREATE TABLE "secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"envelope" "bytea",
	"envelope_iv" "bytea",
	"management_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"burned_at" timestamp with time zone,
	"burn_reason" text
);
