CREATE TABLE "releve_coulage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"releve_journalier_id" uuid NOT NULL,
	"rang" smallint DEFAULT 0 NOT NULL,
	"ouvrage" text NOT NULL,
	"classe_beton" text NOT NULL,
	"volume_m3" numeric(8, 2) NOT NULL,
	"bon_livraison" text,
	"affaissement_mm" smallint,
	"eprouvettes" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "releve_coulage_volume" CHECK ("releve_coulage"."volume_m3" > 0 and "releve_coulage"."volume_m3" <= 2000),
	CONSTRAINT "releve_coulage_affaissement" CHECK ("releve_coulage"."affaissement_mm" is null or "releve_coulage"."affaissement_mm" between 0 and 300),
	CONSTRAINT "releve_coulage_eprouvettes" CHECK ("releve_coulage"."eprouvettes" between 0 and 60)
);
--> statement-breakpoint
ALTER TABLE "releve_coulage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "releve_livraison" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"releve_journalier_id" uuid NOT NULL,
	"rang" smallint DEFAULT 0 NOT NULL,
	"designation" text NOT NULL,
	"fournisseur" text,
	"quantite" numeric(14, 3) NOT NULL,
	"unite" "unite_mesure" NOT NULL,
	"bon_livraison" text,
	"conforme" boolean DEFAULT true NOT NULL,
	"reserve" text,
	CONSTRAINT "releve_livraison_quantite" CHECK ("releve_livraison"."quantite" > 0),
	CONSTRAINT "releve_livraison_reserve" CHECK ("releve_livraison"."conforme" or "releve_livraison"."reserve" is not null)
);
--> statement-breakpoint
ALTER TABLE "releve_livraison" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "releve_coulage" ADD CONSTRAINT "releve_coulage_releve_journalier_id_releve_journalier_id_fk" FOREIGN KEY ("releve_journalier_id") REFERENCES "public"."releve_journalier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_livraison" ADD CONSTRAINT "releve_livraison_releve_journalier_id_releve_journalier_id_fk" FOREIGN KEY ("releve_journalier_id") REFERENCES "public"."releve_journalier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "releve_coulage_releve_idx" ON "releve_coulage" USING btree ("releve_journalier_id");--> statement-breakpoint
CREATE INDEX "releve_livraison_releve_idx" ON "releve_livraison" USING btree ("releve_journalier_id");--> statement-breakpoint

-- Le journal d'un releve gele est gele avec lui, comme ses quantites : un
-- coulage ou une livraison consignes dans un releve valide entrent dans le
-- dossier des ouvrages executes. Le releve parent introuvable signale une
-- suppression en cascade, qui reste admise.
CREATE OR REPLACE FUNCTION geler_journal_releve_valide() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  statut_parent statut_releve;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT statut INTO statut_parent FROM releve_journalier WHERE id = OLD.releve_journalier_id;
    IF statut_parent IN ('VALIDE', 'RECTIFIE') THEN
      RAISE EXCEPTION 'Le journal d un releve gele ne se modifie pas.' USING ERRCODE = 'CS001';
    END IF;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT statut INTO statut_parent FROM releve_journalier WHERE id = NEW.releve_journalier_id;
    IF statut_parent IN ('VALIDE', 'RECTIFIE') THEN
      RAISE EXCEPTION 'Le journal d un releve gele ne se modifie pas.' USING ERRCODE = 'CS001';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER gel_releve_coulage
BEFORE INSERT OR UPDATE OR DELETE ON releve_coulage
FOR EACH ROW EXECUTE FUNCTION geler_journal_releve_valide();
--> statement-breakpoint

CREATE TRIGGER gel_releve_livraison
BEFORE INSERT OR UPDATE OR DELETE ON releve_livraison
FOR EACH ROW EXECUTE FUNCTION geler_journal_releve_valide();
