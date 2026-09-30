-- Journal d'audit alimente par declencheur.
--
-- Pose sur les quatre tables dont la modification engage la responsabilite de
-- l'entreprise : les releves journaliers et leurs quantites, les taches et le
-- quantitatif. Un declencheur ne s'oublie pas, contrairement a un appel
-- applicatif que l'on peut omettre dans une nouvelle mutation.
--
-- L'identite de l'auteur provient du parametre de session `app.user_id`,
-- positionne par SET LOCAL en tete de transaction. Elle est nulle pour les
-- ecritures du peuplement et des taches planifiees : c'est l'information
-- exacte, pas une lacune.

CREATE OR REPLACE FUNCTION tracer_modification() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auteur uuid;
BEGIN
  -- Le second argument a true rend la lecture tolerante a l'absence du
  -- parametre : hors transaction applicative, l'auteur reste nul.
  BEGIN
    auteur := nullif(current_setting('app.user_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    auteur := NULL;
  END;

  INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, avant, apres)
  VALUES (
    auteur,
    TG_OP,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER audit_releve_journalier
AFTER INSERT OR UPDATE OR DELETE ON releve_journalier
FOR EACH ROW EXECUTE FUNCTION tracer_modification();
--> statement-breakpoint

CREATE TRIGGER audit_releve_quantite
AFTER INSERT OR UPDATE OR DELETE ON releve_quantite
FOR EACH ROW EXECUTE FUNCTION tracer_modification();
--> statement-breakpoint

CREATE TRIGGER audit_ligne_quantitatif
AFTER INSERT OR UPDATE OR DELETE ON ligne_quantitatif
FOR EACH ROW EXECUTE FUNCTION tracer_modification();
--> statement-breakpoint

-- La tache est auditee sur ses seules colonnes de source de verite. Les
-- colonnes de cache (avancement, marges, criticite, poids budgetaire) sont
-- recalculees a chaque validation de releve et a chaque nuit : les auditer
-- noierait le journal sous des milliers de lignes sans valeur probante.
CREATE TRIGGER audit_tache
AFTER INSERT OR DELETE ON tache
FOR EACH ROW EXECUTE FUNCTION tracer_modification();
--> statement-breakpoint

CREATE TRIGGER audit_tache_maj
AFTER UPDATE OF nom, code_wbs, nature, methode_avancement,
                date_debut_prevue, date_fin_prevue, duree_prevue_j,
                date_debut_reelle, date_fin_reelle
ON tache
FOR EACH ROW EXECUTE FUNCTION tracer_modification();
--> statement-breakpoint

-- Horodatage de modification, tenu par la base et non par l'application.
CREATE OR REPLACE FUNCTION toucher_modifie_le() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.modifie_le := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER touche_releve_journalier
BEFORE UPDATE ON releve_journalier
FOR EACH ROW EXECUTE FUNCTION toucher_modifie_le();
