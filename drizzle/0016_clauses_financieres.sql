ALTER TABLE "projet" ADD COLUMN "retenue_garantie_taux" numeric(5, 4) DEFAULT 0.05 NOT NULL;--> statement-breakpoint
ALTER TABLE "projet" ADD COLUMN "avance_demarrage_taux" numeric(5, 4) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "projet" ADD COLUMN "avance_remboursement_debut" numeric(5, 4) DEFAULT 0.65 NOT NULL;--> statement-breakpoint
ALTER TABLE "projet" ADD COLUMN "avance_remboursement_fin" numeric(5, 4) DEFAULT 0.8 NOT NULL;--> statement-breakpoint
ALTER TABLE "projet" ADD CONSTRAINT "projet_clauses_financieres_fractions" CHECK ("projet"."retenue_garantie_taux" between 0 and 1 and "projet"."avance_demarrage_taux" between 0 and 1);--> statement-breakpoint
ALTER TABLE "projet" ADD CONSTRAINT "projet_seuils_avance_ordonnes" CHECK ("projet"."avance_remboursement_debut" >= 0 and "projet"."avance_remboursement_debut" < "projet"."avance_remboursement_fin" and "projet"."avance_remboursement_fin" <= 1);