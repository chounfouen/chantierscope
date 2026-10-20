-- Ordre inverse de celui genere : la cle etrangere composite exige que la
-- contrainte d'unicite qu'elle vise existe deja.
ALTER TABLE "lot" ADD CONSTRAINT "lot_id_projet_unique" UNIQUE("id","projet_id");--> statement-breakpoint
ALTER TABLE "releve_journalier" ADD CONSTRAINT "releve_lot_meme_projet" FOREIGN KEY ("lot_id","projet_id") REFERENCES "public"."lot"("id","projet_id") ON DELETE cascade ON UPDATE no action;
