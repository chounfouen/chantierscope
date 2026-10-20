ALTER TABLE "element_maquette" ADD COLUMN "volume_m3" numeric(12, 3);--> statement-breakpoint
ALTER TABLE "element_maquette" ADD COLUMN "source_quantite" text;--> statement-breakpoint
ALTER TABLE "element_maquette" ADD CONSTRAINT "element_maquette_source_quantite" CHECK ("element_maquette"."source_quantite" is null or "element_maquette"."source_quantite" in ('QTO', 'GEOMETRIE'));