-- Gel des releves valides.
--
-- Un releve valide par le conducteur engage l'entreprise : il entre dans le
-- dossier des ouvrages executes et dans les indicateurs contractuels. Il ne se
-- modifie plus. Toute correction passe par un releve rectificatif, qui le
-- remplace et le fait passer au statut RECTIFIE.
--
-- La regle est portee par la base et non par l'application seule : une
-- mutation ecrite demain, un script de maintenance ou une requete manuelle ne
-- peuvent pas la contourner par oubli.
--
-- Seules transitions admises sur un releve gele :
--   VALIDE   -> RECTIFIE, sans autre changement que le statut ;
--   RECTIFIE : renseignement unique du releve qui le remplace ;
--   completion de la meteo par la tache nocturne, uniquement si le releve
--   n'en portait aucune. Combler une mesure absente n'est pas reecrire une
--   observation : une meteo deja renseignee reste intouchable.
--
-- La suppression d'un releve gele reste possible lorsque son lot ou son projet
-- disparait : c'est la suppression en cascade, choisie explicitement dans le
-- schema. Elle n'est pas une modification du releve mais la fin de l'operation.
--
-- Code d'erreur dedie, CS001, pour que l'application distingue ce refus d'une
-- erreur technique et l'explique en clair.

CREATE OR REPLACE FUNCTION geler_releve_valide() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  avant jsonb;
  apres jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.statut IN ('VALIDE', 'RECTIFIE')
       AND EXISTS (SELECT 1 FROM lot WHERE id = OLD.lot_id) THEN
      RAISE EXCEPTION 'Le releve du % est gele : il ne peut pas etre supprime.', OLD.date
        USING ERRCODE = 'CS001';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.statut NOT IN ('VALIDE', 'RECTIFIE') THEN
    RETURN NEW;
  END IF;

  avant := to_jsonb(OLD) - 'statut' - 'remplace_par' - 'modifie_le';
  apres := to_jsonb(NEW) - 'statut' - 'remplace_par' - 'modifie_le';

  IF OLD.precipitations_mm IS NULL THEN
    avant := avant - 'meteo_code' - 'temperature_c' - 'precipitations_mm' - 'rafales_kmh';
    apres := apres - 'meteo_code' - 'temperature_c' - 'precipitations_mm' - 'rafales_kmh';
  END IF;

  IF avant IS DISTINCT FROM apres THEN
    RAISE EXCEPTION 'Le releve du % est gele : passer par un releve rectificatif.', OLD.date
      USING ERRCODE = 'CS001';
  END IF;

  IF OLD.statut = 'VALIDE' AND NEW.statut NOT IN ('VALIDE', 'RECTIFIE') THEN
    RAISE EXCEPTION 'Un releve valide ne revient pas au statut %.', NEW.statut
      USING ERRCODE = 'CS001';
  END IF;

  IF OLD.statut = 'RECTIFIE' AND NEW.statut <> 'RECTIFIE' THEN
    RAISE EXCEPTION 'Un releve rectifie ne change plus de statut.'
      USING ERRCODE = 'CS001';
  END IF;

  IF OLD.remplace_par IS NOT NULL AND NEW.remplace_par IS DISTINCT FROM OLD.remplace_par THEN
    RAISE EXCEPTION 'Le releve qui remplace celui du % est deja designe.', OLD.date
      USING ERRCODE = 'CS001';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER gel_releve_journalier
BEFORE UPDATE OR DELETE ON releve_journalier
FOR EACH ROW EXECUTE FUNCTION geler_releve_valide();
--> statement-breakpoint

-- Les quantites d'un releve gele sont gelees avec lui. Le releve parent
-- introuvable signale une suppression en cascade, qui reste admise.
CREATE OR REPLACE FUNCTION geler_quantites_releve_valide() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent uuid;
  statut_parent statut_releve;
BEGIN
  parent := CASE WHEN TG_OP = 'DELETE' THEN OLD.releve_journalier_id
                 ELSE NEW.releve_journalier_id END;

  SELECT statut INTO statut_parent FROM releve_journalier WHERE id = parent;

  IF statut_parent IN ('VALIDE', 'RECTIFIE') THEN
    RAISE EXCEPTION 'Les quantites d un releve gele ne se modifient pas.'
      USING ERRCODE = 'CS001';
  END IF;

  -- Une quantite deplacee d'un releve gele vers un autre en sort aussi.
  IF TG_OP = 'UPDATE' AND OLD.releve_journalier_id <> NEW.releve_journalier_id THEN
    SELECT statut INTO statut_parent FROM releve_journalier WHERE id = OLD.releve_journalier_id;
    IF statut_parent IN ('VALIDE', 'RECTIFIE') THEN
      RAISE EXCEPTION 'Les quantites d un releve gele ne se modifient pas.'
        USING ERRCODE = 'CS001';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER gel_releve_quantite
BEFORE INSERT OR UPDATE OR DELETE ON releve_quantite
FOR EACH ROW EXECUTE FUNCTION geler_quantites_releve_valide();
