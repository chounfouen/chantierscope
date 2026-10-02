ALTER TABLE "alea" ADD COLUMN "releve_journalier_id" uuid;--> statement-breakpoint
ALTER TABLE "releve_journalier" ADD COLUMN "meteo_corrigee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "alea" ADD CONSTRAINT "alea_releve_journalier_id_releve_journalier_id_fk" FOREIGN KEY ("releve_journalier_id") REFERENCES "public"."releve_journalier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alea_releve_unique" ON "alea" USING btree ("releve_journalier_id");