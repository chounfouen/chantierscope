CREATE TABLE "reference_planning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"numero" smallint NOT NULL,
	"motif" text NOT NULL,
	"gele_le" timestamp with time zone DEFAULT now() NOT NULL,
	"gele_par_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reference_numero_unique" UNIQUE("projet_id","numero")
);
--> statement-breakpoint
ALTER TABLE "reference_planning" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reference_tache" (
	"reference_id" uuid NOT NULL,
	"tache_id" uuid NOT NULL,
	"date_debut" date NOT NULL,
	"duree_j" integer NOT NULL,
	CONSTRAINT "reference_tache_reference_id_tache_id_pk" PRIMARY KEY("reference_id","tache_id"),
	CONSTRAINT "reference_tache_duree_positive" CHECK ("reference_tache"."duree_j" > 0)
);
--> statement-breakpoint
ALTER TABLE "reference_tache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reference_planning" ADD CONSTRAINT "reference_planning_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_planning" ADD CONSTRAINT "reference_planning_gele_par_id_utilisateur_id_fk" FOREIGN KEY ("gele_par_id") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_tache" ADD CONSTRAINT "reference_tache_reference_id_reference_planning_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."reference_planning"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_tache" ADD CONSTRAINT "reference_tache_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reference_active_unique" ON "reference_planning" USING btree ("projet_id") WHERE active;--> statement-breakpoint
-- Reprise des projets existants : leur planning courant devient la
-- reference numero 1. Sur une base neuve, le peuplement s'en charge.
INSERT INTO "reference_planning" ("projet_id", "numero", "motif", "gele_le")
SELECT p."id", 1, 'Planning contractuel initial (repris à la mise en place des références)', p."cree_le"
  FROM "projet" p;--> statement-breakpoint
INSERT INTO "reference_tache" ("reference_id", "tache_id", "date_debut", "duree_j")
SELECT r."id", t."id", t."date_debut_prevue", t."duree_prevue_j"
  FROM "reference_planning" r
  JOIN "lot" l ON l."projet_id" = r."projet_id"
  JOIN "tache" t ON t."lot_id" = l."id" AND t."parent_id" IS NOT NULL;
