CREATE TYPE "public"."statut_decompte" AS ENUM('PRESENTEE', 'ACCEPTEE');--> statement-breakpoint
CREATE TABLE "decompte" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"mois" date NOT NULL,
	"date_arrete" date NOT NULL,
	"travaux_xof" bigint NOT NULL,
	"revision_xof" bigint DEFAULT 0 NOT NULL,
	"retenue_garantie_xof" bigint NOT NULL,
	"remboursement_avance_xof" bigint NOT NULL,
	"penalites_xof" bigint NOT NULL,
	"net_cumule_xof" bigint NOT NULL,
	"a_payer_xof" bigint NOT NULL,
	"statut" "statut_decompte" DEFAULT 'PRESENTEE' NOT NULL,
	"presente_le" date NOT NULL,
	"presente_par_id" uuid,
	"accepte_le" date,
	"accepte_par_id" uuid,
	CONSTRAINT "decompte_mois_unique" UNIQUE("projet_id","mois"),
	CONSTRAINT "decompte_numero_unique" UNIQUE("projet_id","numero"),
	CONSTRAINT "decompte_acceptation" CHECK (("decompte"."statut" = 'ACCEPTEE') = ("decompte"."accepte_le" is not null))
);
--> statement-breakpoint
ALTER TABLE "decompte" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "indice_revision" (
	"projet_id" uuid NOT NULL,
	"mois" date NOT NULL,
	"valeur" numeric(10, 2) NOT NULL,
	CONSTRAINT "indice_revision_projet_id_mois_pk" PRIMARY KEY("projet_id","mois"),
	CONSTRAINT "indice_revision_premier_du_mois" CHECK (extract(day from "indice_revision"."mois") = 1),
	CONSTRAINT "indice_revision_positif" CHECK ("indice_revision"."valeur" > 0)
);
--> statement-breakpoint
ALTER TABLE "indice_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projet" ADD COLUMN "mois_zero_revision" date;--> statement-breakpoint
ALTER TABLE "projet" ADD COLUMN "revision_partie_fixe" numeric(5, 4) DEFAULT 0.15 NOT NULL;--> statement-breakpoint
ALTER TABLE "projet" ADD COLUMN "indice_revision_nom" text;--> statement-breakpoint
ALTER TABLE "decompte" ADD CONSTRAINT "decompte_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decompte" ADD CONSTRAINT "decompte_presente_par_id_utilisateur_id_fk" FOREIGN KEY ("presente_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decompte" ADD CONSTRAINT "decompte_accepte_par_id_utilisateur_id_fk" FOREIGN KEY ("accepte_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indice_revision" ADD CONSTRAINT "indice_revision_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Les decomptes fondent les paiements : figes une fois acceptes, et traces.
CREATE OR REPLACE FUNCTION geler_decompte_accepte() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.statut = 'ACCEPTEE' AND EXISTS (SELECT 1 FROM projet WHERE id = OLD.projet_id) THEN
    RAISE EXCEPTION 'Le decompte n % est accepte : il ne se modifie plus.', OLD.numero
      USING ERRCODE = 'CS001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER gel_decompte BEFORE UPDATE OR DELETE ON "decompte"
  FOR EACH ROW EXECUTE FUNCTION geler_decompte_accepte();
--> statement-breakpoint
CREATE TRIGGER audit_decompte AFTER INSERT OR UPDATE OR DELETE ON "decompte"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();
