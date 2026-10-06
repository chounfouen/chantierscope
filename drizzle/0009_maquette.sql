-- Maquette numerique du batiment (IFC) et rattachement des taches.
--
-- Une maquette par projet, convertie en GLB a l'import ; son inventaire
-- d'elements ; les regles qui rattachent une tache a une famille
-- d'ouvrages, un etage, un mot du nom. L'import d'une maquette et les
-- regles changent ce que montre l'ecran au maitre d'ouvrage : ils sont
-- traces. L'inventaire, entierement reecrit a chaque import, ne l'est pas :
-- il n'a pas d'identifiant propre, et l'import de la maquette le resume.
CREATE TYPE "public"."famille_ouvrage" AS ENUM('MURS', 'POTEAUX', 'POUTRES', 'DALLES', 'FONDATIONS', 'ESCALIERS', 'TOITURE', 'MENUISERIES', 'GARDE_CORPS', 'REVETEMENTS', 'EQUIPEMENTS', 'AUTRES');--> statement-breakpoint
CREATE TABLE "element_maquette" (
	"maquette_id" uuid NOT NULL,
	"global_id" text NOT NULL,
	"classe" text NOT NULL,
	"nom" text,
	"etage" text,
	CONSTRAINT "element_maquette_maquette_id_global_id_pk" PRIMARY KEY("maquette_id","global_id")
);
--> statement-breakpoint
ALTER TABLE "element_maquette" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "maquette" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"chemin" text NOT NULL,
	"octets" integer NOT NULL,
	"nom_fichier" text NOT NULL,
	"schema_ifc" text NOT NULL,
	"etages" jsonb NOT NULL,
	"importe_le" timestamp with time zone DEFAULT now() NOT NULL,
	"importe_par" uuid,
	CONSTRAINT "maquette_projet_unique" UNIQUE("projet_id"),
	CONSTRAINT "maquette_octets_positif" CHECK ("maquette"."octets" > 0)
);
--> statement-breakpoint
ALTER TABLE "maquette" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "regle_maquette" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"tache_id" uuid NOT NULL,
	"famille" "famille_ouvrage" NOT NULL,
	"niveau" smallint,
	"nom_contient" text,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regle_maquette_unique" UNIQUE NULLS NOT DISTINCT("tache_id","famille","niveau","nom_contient")
);
--> statement-breakpoint
ALTER TABLE "regle_maquette" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "element_maquette" ADD CONSTRAINT "element_maquette_maquette_id_maquette_id_fk" FOREIGN KEY ("maquette_id") REFERENCES "public"."maquette"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette" ADD CONSTRAINT "maquette_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maquette" ADD CONSTRAINT "maquette_importe_par_utilisateur_id_fk" FOREIGN KEY ("importe_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regle_maquette" ADD CONSTRAINT "regle_maquette_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regle_maquette" ADD CONSTRAINT "regle_maquette_tache_id_tache_id_fk" FOREIGN KEY ("tache_id") REFERENCES "public"."tache"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "regle_maquette_projet_idx" ON "regle_maquette" USING btree ("projet_id");--> statement-breakpoint
CREATE TRIGGER audit_maquette
AFTER INSERT OR UPDATE OR DELETE ON maquette
FOR EACH ROW EXECUTE FUNCTION tracer_modification();--> statement-breakpoint
CREATE TRIGGER audit_regle_maquette
AFTER INSERT OR UPDATE OR DELETE ON regle_maquette
FOR EACH ROW EXECUTE FUNCTION tracer_modification();
