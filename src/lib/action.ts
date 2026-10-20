/**
 * Reponse commune des Server Actions : un message pour l'utilisateur, jamais
 * une trace technique. Les refus metier passent tels quels ; le reste est
 * journalise cote serveur et rendu en termes generaux.
 */

import { RefusMetier } from '@/db/mutations/erreurs'
import { NonAuthentifie, NonAutorise } from '@/lib/garde'

export type ResultatAction = { ok: true; message: string } | { ok: false; message: string }

export function echecAction(e: unknown, contexte: string): ResultatAction {
  if (e instanceof RefusMetier) return { ok: false, message: e.message }
  if (e instanceof NonAuthentifie) {
    return { ok: false, message: 'Session expirée : se reconnecter.' }
  }
  if (e instanceof NonAutorise) {
    return { ok: false, message: 'Action non autorisée pour ce compte.' }
  }
  console.error(`Échec : ${contexte}`, e)
  return { ok: false, message: 'Action impossible pour le moment.' }
}

/** Premier message d'une analyse refusee, ou un message generique. */
export function refusAnalyse(
  erreur: { issues: { message: string }[] },
  defaut: string,
): ResultatAction {
  return { ok: false, message: erreur.issues[0]?.message ?? defaut }
}
