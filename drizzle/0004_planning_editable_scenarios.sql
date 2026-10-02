CREATE TABLE "scenario_simulation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"nom" text NOT NULL,
	"description" text,
	"perturbations" jsonb NOT NULL,
	"cree_par_id" uuid,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenario_nom_non_vide" CHECK (length(trim("scenario_simulation"."nom")) > 0)
);
--> statement-breakpoint
ALTER TABLE "tache" ADD COLUMN "debut_impose" date;--> statement-breakpoint
ALTER TABLE "scenario_simulation" ADD CONSTRAINT "scenario_simulation_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_simulation" ADD CONSTRAINT "scenario_simulation_cree_par_id_utilisateur_id_fk" FOREIGN KEY ("cree_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scenario_projet_idx" ON "scenario_simulation" USING btree ("projet_id","cree_le");