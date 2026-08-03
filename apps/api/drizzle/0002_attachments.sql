CREATE TABLE "attachments" (
	"secret_id" text NOT NULL,
	"index" integer NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"iv" "bytea" NOT NULL,
	CONSTRAINT "attachments_secret_id_index_pk" PRIMARY KEY("secret_id","index")
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_secret_id_secrets_id_fk" FOREIGN KEY ("secret_id") REFERENCES "public"."secrets"("id") ON DELETE cascade ON UPDATE no action;