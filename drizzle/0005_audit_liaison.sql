-- Audit des liaisons du planning.
--
-- Depuis le sprint 6, le conducteur de travaux modifie le reseau : une
-- liaison ajoutee ou supprimee deplace des dates prevues, donc la valeur
-- planifiee et les penalites projetees. Elle engage autant qu'une
-- modification de tache, deja tracee : meme declencheur, meme journal.

CREATE TRIGGER audit_liaison
AFTER INSERT OR UPDATE OR DELETE ON liaison
FOR EACH ROW EXECUTE FUNCTION tracer_modification();
