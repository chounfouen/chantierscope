-- Debourse previsionnel porte par les instantanes.
--
-- Le cout estime final et l'ecart final s'expriment au cout, par le
-- coefficient de debourse. Le porter dans le cache permet au tableau de bord
-- de les lire sans recharger les affectations du planning. Donnee derivee :
-- reconstruite integralement par recompute().
ALTER TABLE "snapshot_avancement" ADD COLUMN "budget_debourse_xof" bigint DEFAULT 0 NOT NULL;
