CREATE TYPE "public"."phase_reserve" AS ENUM('OPR', 'RECEPTION', 'PARFAIT_ACHEVEMENT');--> statement-breakpoint
CREATE TABLE "reserve" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"phase" "phase_reserve" NOT NULL,
	"zone_id" uuid,
	"lot_id" uuid,
	"description" text NOT NULL,
	"constatee_le" date NOT NULL,
	"echeance" date,
	"levee_le" date,
	"cree_par_id" uuid,
	"levee_par_id" uuid,
	CONSTRAINT "reserve_numero_unique" UNIQUE("projet_id","numero"),
	CONSTRAINT "reserve_levee_apres_constat" CHECK ("reserve"."levee_le" is null or "reserve"."levee_le" >= "reserve"."constatee_le"),
	CONSTRAINT "reserve_echeance_apres_constat" CHECK ("reserve"."echeance" is null or "reserve"."echeance" >= "reserve"."constatee_le")
);
--> statement-breakpoint
ALTER TABLE "reserve" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projet" ADD COLUMN "date_reception" date;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_lot_id_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lot"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserve" ADD CONSTRAINT "reserve_levee_par_id_utilisateur_id_fk" FOREIGN KEY ("levee_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reserve_zone_idx" ON "reserve" USING btree ("zone_id");--> statement-breakpoint

-- Les reserves fondent la levee des retenues : tracees.
CREATE TRIGGER audit_reserve AFTER INSERT OR UPDATE OR DELETE ON "reserve"
  FOR EACH ROW EXECUTE FUNCTION tracer_modification();
