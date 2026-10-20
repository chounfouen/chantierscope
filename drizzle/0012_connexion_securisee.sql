CREATE TABLE "tentative_connexion" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"reussie" boolean NOT NULL,
	"le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tentative_connexion" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "utilisateur" ADD COLUMN "sessions_valides_apres" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "tentative_email_le_idx" ON "tentative_connexion" USING btree (lower("email"),"le");--> statement-breakpoint
CREATE INDEX "tentative_ip_le_idx" ON "tentative_connexion" USING btree ("ip","le");