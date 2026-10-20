CREATE TABLE "releve_engin" (
	"releve_journalier_id" uuid NOT NULL,
	"ressource_id" uuid NOT NULL,
	"heures" numeric(6, 2) NOT NULL,
	CONSTRAINT "releve_engin_releve_journalier_id_ressource_id_pk" PRIMARY KEY("releve_journalier_id","ressource_id"),
	CONSTRAINT "releve_engin_heures" CHECK ("releve_engin"."heures" > 0 and "releve_engin"."heures" <= 2400)
);
--> statement-breakpoint
ALTER TABLE "releve_engin" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ressource" ADD COLUMN "dans_frais_chantier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "releve_engin" ADD CONSTRAINT "releve_engin_releve_journalier_id_releve_journalier_id_fk" FOREIGN KEY ("releve_journalier_id") REFERENCES "public"."releve_journalier"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releve_engin" ADD CONSTRAINT "releve_engin_ressource_id_ressource_id_fk" FOREIGN KEY ("ressource_id") REFERENCES "public"."ressource"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "releve_engin_ressource_idx" ON "releve_engin" USING btree ("ressource_id");--> statement-breakpoint

-- Les heures d'engin d'un releve gele sont gelees avec lui, comme son journal.
CREATE TRIGGER gel_releve_engin
BEFORE INSERT OR UPDATE OR DELETE ON releve_engin
FOR EACH ROW EXECUTE FUNCTION geler_journal_releve_valide();
--> statement-breakpoint

-- Une grue a tour est louee au mois et comptee dans les frais de chantier.
UPDATE ressource SET dans_frais_chantier = true WHERE type = 'ENGIN' AND nom ILIKE 'grue%';
