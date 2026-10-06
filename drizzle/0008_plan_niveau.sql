-- Fond de plan importe par niveau, et audit des zones.
--
-- Le conducteur de travaux importe desormais le plan de chaque niveau et
-- dessine les zones dessus : un plan remplace ou une zone redessinee change
-- ce que montre le plan interactif au maitre d'ouvrage. Ces ecritures sont
-- tracees par le meme declencheur que le planning. La table de liaison
-- zone_tache n'a pas d'identifiant propre : son contenu est trace a travers
-- la zone, dont chaque modification reecrit les rattachements.
CREATE TYPE "public"."format_plan" AS ENUM('DXF', 'PDF', 'SVG', 'IMAGE');--> statement-breakpoint
CREATE TABLE "plan_niveau" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projet_id" uuid NOT NULL,
	"niveau" smallint NOT NULL,
	"chemin" text NOT NULL,
	"largeur" integer NOT NULL,
	"hauteur" integer NOT NULL,
	"octets" integer NOT NULL,
	"format_source" "format_plan" NOT NULL,
	"nom_fichier" text NOT NULL,
	"importe_le" timestamp with time zone DEFAULT now() NOT NULL,
	"importe_par" uuid,
	CONSTRAINT "plan_niveau_unique" UNIQUE("projet_id","niveau"),
	CONSTRAINT "plan_niveau_dimensions" CHECK ("plan_niveau"."largeur" between 1 and 8192 and "plan_niveau"."hauteur" between 1 and 8192),
	CONSTRAINT "plan_niveau_octets_positif" CHECK ("plan_niveau"."octets" > 0),
	CONSTRAINT "plan_niveau_borne" CHECK ("plan_niveau"."niveau" between -9 and 199)
);
--> statement-breakpoint
ALTER TABLE "plan_niveau" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_niveau" ADD CONSTRAINT "plan_niveau_projet_id_projet_id_fk" FOREIGN KEY ("projet_id") REFERENCES "public"."projet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_niveau" ADD CONSTRAINT "plan_niveau_importe_par_utilisateur_id_fk" FOREIGN KEY ("importe_par") REFERENCES "public"."utilisateur"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER audit_plan_niveau
AFTER INSERT OR UPDATE OR DELETE ON plan_niveau
FOR EACH ROW EXECUTE FUNCTION tracer_modification();--> statement-breakpoint
CREATE TRIGGER audit_zone
AFTER INSERT OR UPDATE OR DELETE ON zone
FOR EACH ROW EXECUTE FUNCTION tracer_modification();
