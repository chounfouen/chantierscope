CREATE TYPE "public"."calendrier_tache" AS ENUM('CALENDAIRE', 'OUVRE');--> statement-breakpoint
ALTER TABLE "reference_tache" ADD COLUMN "date_fin" date;--> statement-breakpoint
-- Les references existantes sont toutes en jours calendaires.
UPDATE "reference_tache" SET "date_fin" = "date_debut" + "duree_j" - 1;--> statement-breakpoint
ALTER TABLE "reference_tache" ALTER COLUMN "date_fin" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_tache" ADD COLUMN "calendrier" "calendrier_tache" DEFAULT 'CALENDAIRE' NOT NULL;--> statement-breakpoint
ALTER TABLE "tache" ADD COLUMN "calendrier" "calendrier_tache" DEFAULT 'CALENDAIRE' NOT NULL;--> statement-breakpoint
ALTER TABLE "reference_tache" ADD CONSTRAINT "reference_tache_dates_ordonnees" CHECK ("reference_tache"."date_fin" >= "reference_tache"."date_debut");
