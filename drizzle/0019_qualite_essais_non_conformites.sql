CREATE TYPE "public"."statut_non_conformite" AS ENUM('OUVERTE', 'TRAITEE', 'LEVEE');--> statement-breakpoint
CREATE TABLE "essai_beton" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coulage_id" uuid NOT NULL,
	"prelevement" smallint DEFAULT 1 NOT NULL,
	"age_j" smallint NOT NULL,
	"date_ecrasement" date NOT NULL,
	"resistance_mpa" numeric(5, 1) NOT NULL,
	"laboratoire" text,
	"cree_par_id" uuid,
	CONSTRAINT "essai_beton_age" CHECK ("essai_beton"."age_j" between 1 and 365),
	CONSTRAINT "essai_beton_resistance" CHECK ("essai_beton"."resistance_mpa" > 0 and "essai_beton"."resistance_mpa" < 200),
	CONSTRAINT "essai_beton_prelevement" CHECK ("essai_beton"."prelevement" between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "essai_beton" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "non_conformite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"date_constat" date NOT NULL,
	"lot_id" uuid,
	"coulage_id" uuid,
	"alea_id" uuid,
	"titre" text NOT NULL,
	"constat" text NOT NULL,
	"gravite" smallint DEFAULT 2 NOT NULL,
	"cause" text,
	"action" text,
	"statut" "statut_non_conformite" DEFAULT 'OUVERTE' NOT NULL,
	"traitee_le" date,
	"levee_le" date,
	"cree_par_id" uuid,
	"levee_par_id" uuid,
	CONSTRAINT "non_conformite_numero_unique" UNIQUE("projet_id","numero"),
	CONSTRAINT "non_conformite_gravite" CHECK ("non_conformite"."gravite" between 1 and 4),
	CONSTRAINT "non_conformite_traitement" CHECK ("non_conformite"."statut" = 'OUVERTE' or ("non_conformite"."cause" is not null and "non_conformite"."action" is not null and "non_conformite"."traitee_le" is not null)),
	CONSTRAINT "non_conformite_levee" CHECK (("non_conformite"."statut" = 'LEVEE') = ("non_conformite"."levee_le" is not null)),
	CONSTRAINT "non_conformite_chronologie" CHECK (("non_conformite"."traitee_le" is null or "non_conformite"."traitee_le" >= "non_conformite"."date_constat") and ("non_conformite"."levee_le" is null or "non_conformite"."levee_le" >= "non_conformite"."traitee_le"))
);
--> statement-breakpoint
ALTER TABLE "non_conformite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "releve_coulage" ADD COLUMN "ferraillage_receptionne" boolean;--> statement-breakpoint
ALTER TABLE "essai_beton" ADD CONSTRAINT "essai_beton_coulage_id_releve_coulage_id_fk" FOREIGN KEY ("coulage_id") REFERENCES "public"."releve_coulage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "essai_beton" ADD CONSTRAINT "essai_beton_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformite" ADD CONSTRAINT "non_conformite_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformite" ADD CONSTRAINT "non_conformite_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformite" ADD CONSTRAINT "non_conformite_coulage_id_releve_coulage_id_fk" FOREIGN KEY ("coulage_id") REFERENCES "public"."releve_coulage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformite" ADD CONSTRAINT "non_conformite_alea_id_alea_id_fk" FOREIGN KEY ("alea_id") REFERENCES "public"."alea"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformite" ADD CONSTRAINT "non_conformite_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformite" ADD CONSTRAINT "non_conformite_levee_par_id_utilisateur_id_fk" FOREIGN KEY ("levee_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "essai_beton_coulage_idx" ON "essai_beton" USING btree ("coulage_id");--> statement-breakpoint

-- Essais et fiches de non-conformite entrent au dossier qualite : traces.
CREATE TRIGGER audit_essai_beton AFTER INSERT OR UPDATE OR DELETE ON "essai_beton"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();--> statement-breakpoint
CREATE TRIGGER audit_non_conformite AFTER INSERT OR UPDATE OR DELETE ON "non_conformite"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();
