CREATE TYPE "public"."statut_agrement" AS ENUM('DEMANDE', 'AGREE', 'REFUSE');--> statement-breakpoint
CREATE TYPE "public"."type_evenement_securite" AS ENUM('ACCIDENT_AVEC_ARRET', 'ACCIDENT_SANS_ARRET', 'PRESQU_ACCIDENT', 'SITUATION_DANGEREUSE', 'CAUSERIE', 'VISITE');--> statement-breakpoint
CREATE TABLE "evenement_securite" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" "type_evenement_securite" NOT NULL,
	"lot_id" uuid,
	"sous_traitant_id" uuid,
	"description" text NOT NULL,
	"jours_arret" integer DEFAULT 0 NOT NULL,
	"participants" integer,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evenement_securite_arret_coherent" CHECK (("evenement_securite"."type" = 'ACCIDENT_AVEC_ARRET') = ("evenement_securite"."jours_arret" > 0)),
	CONSTRAINT "evenement_securite_participants" CHECK ("evenement_securite"."participants" is null or "evenement_securite"."participants" > 0)
);
--> statement-breakpoint
ALTER TABLE "evenement_securite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sous_traitant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"raison_sociale" text NOT NULL,
	"specialite" text NOT NULL,
	"montant_xof" bigint NOT NULL,
	"paiement_direct" boolean DEFAULT true NOT NULL,
	"statut" "statut_agrement" DEFAULT 'DEMANDE' NOT NULL,
	"demande_le" date NOT NULL,
	"statue_le" date,
	"cree_par_id" uuid,
	CONSTRAINT "sous_traitant_unique" UNIQUE("projet_id","raison_sociale"),
	CONSTRAINT "sous_traitant_montant_positif" CHECK ("sous_traitant"."montant_xof" > 0),
	CONSTRAINT "sous_traitant_decision_datee" CHECK (("sous_traitant"."statut" = 'DEMANDE') = ("sous_traitant"."statue_le" is null))
);
--> statement-breakpoint
ALTER TABLE "sous_traitant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "sous_traitant_lot" (
	"sous_traitant_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	CONSTRAINT "sous_traitant_lot_sous_traitant_id_lot_id_pk" PRIMARY KEY("sous_traitant_id","lot_id"),
	CONSTRAINT "sous_traitant_lot_unique" UNIQUE("lot_id")
);
--> statement-breakpoint
ALTER TABLE "sous_traitant_lot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "evenement_securite" ADD CONSTRAINT "evenement_securite_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement_securite" ADD CONSTRAINT "evenement_securite_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement_securite" ADD CONSTRAINT "evenement_securite_sous_traitant_id_sous_traitant_id_fk" FOREIGN KEY ("sous_traitant_id") REFERENCES "public"."sous_traitant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evenement_securite" ADD CONSTRAINT "evenement_securite_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sous_traitant" ADD CONSTRAINT "sous_traitant_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sous_traitant" ADD CONSTRAINT "sous_traitant_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sous_traitant_lot" ADD CONSTRAINT "sous_traitant_lot_sous_traitant_id_sous_traitant_id_fk" FOREIGN KEY ("sous_traitant_id") REFERENCES "public"."sous_traitant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sous_traitant_lot" ADD CONSTRAINT "sous_traitant_lot_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "evenement_securite_date_idx" ON "evenement_securite" USING btree ("projet_id","date");--> statement-breakpoint

-- Agrements et registre de securite engagent l entreprise : traces.
CREATE TRIGGER audit_sous_traitant AFTER INSERT OR UPDATE OR DELETE ON "sous_traitant"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();--> statement-breakpoint
CREATE TRIGGER audit_evenement_securite AFTER INSERT OR UPDATE OR DELETE ON "evenement_securite"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();
