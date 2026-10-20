CREATE TYPE "public"."decision_intemperie" AS ENUM('PROPOSEE', 'RECONNUE', 'REJETEE');--> statement-breakpoint
CREATE TYPE "public"."type_ordre_service" AS ENUM('DEMARRAGE', 'ARRET', 'REPRISE', 'PROLONGATION', 'AUTRE');--> statement-breakpoint
CREATE TABLE "avenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"date" date NOT NULL,
	"objet" text NOT NULL,
	"montant_xof" bigint DEFAULT 0 NOT NULL,
	"delai_j" integer DEFAULT 0 NOT NULL,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "avenant_numero_unique" UNIQUE("projet_id","numero"),
	CONSTRAINT "avenant_delai_positif" CHECK ("avenant"."delai_j" >= 0)
);
--> statement-breakpoint
ALTER TABLE "avenant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ordre_service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"date" date NOT NULL,
	"type" "type_ordre_service" NOT NULL,
	"objet" text NOT NULL,
	"delai_j" integer DEFAULT 0 NOT NULL,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ordre_service_numero_unique" UNIQUE("projet_id","numero"),
	CONSTRAINT "ordre_service_delai_positif" CHECK ("ordre_service"."delai_j" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ordre_service" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alea" ADD COLUMN "decision_intemperie" "decision_intemperie";--> statement-breakpoint
ALTER TABLE "projet" ADD COLUMN "intemperies_previsibles_j" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "avenant" ADD CONSTRAINT "avenant_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avenant" ADD CONSTRAINT "avenant_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordre_service" ADD CONSTRAINT "ordre_service_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordre_service" ADD CONSTRAINT "ordre_service_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Les intemperies deja declarees l'ont ete par le conducteur : elles sont
-- tenues pour reconnues, avant que la contrainte ne l'exige.
UPDATE "alea" SET "decision_intemperie" = 'RECONNUE' WHERE "type" = 'INTEMPERIE';--> statement-breakpoint
ALTER TABLE "alea" ADD CONSTRAINT "alea_decision_intemperie_coherente" CHECK (("alea"."type" = 'INTEMPERIE') = ("alea"."decision_intemperie" is not null));--> statement-breakpoint
-- Trace des actes contractuels et des aleas, comme pour les releves.
CREATE TRIGGER audit_avenant AFTER INSERT OR UPDATE OR DELETE ON "avenant"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();--> statement-breakpoint
CREATE TRIGGER audit_ordre_service AFTER INSERT OR UPDATE OR DELETE ON "ordre_service"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();--> statement-breakpoint
CREATE TRIGGER audit_alea AFTER INSERT OR UPDATE OR DELETE ON "alea"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();
