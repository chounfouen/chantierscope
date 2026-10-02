-- Row Level Security en refus general (conception, section 11.8).
--
-- Aucune politique n'est definie : tout role autre que le proprietaire des
-- tables se voit refuser toute ligne. Le navigateur ne parle jamais a la
-- base ; l'application s'y connecte avec le role proprietaire, que la RLS
-- non forcee laisse passer, et l'autorisation reelle reste dans la garde
-- applicative, ou elle est testee. Sur Supabase, les roles exposes par
-- l'API REST, anon et authenticated, ne voient donc rien : c'est un filet de
-- securite si une cle publique venait a fuiter.
ALTER TABLE "acces_projet" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "affectation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "alea" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "jalon" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "journal_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "liaison" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ligne_quantitatif" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "photo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "point_de_vue" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projet" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "releve_journalier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "releve_quantite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ressource" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scenario_simulation" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "snapshot_avancement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "utilisateur" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "zone" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "zone_tache" ENABLE ROW LEVEL SECURITY;