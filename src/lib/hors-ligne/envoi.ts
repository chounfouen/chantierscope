/**
 * Envoi d'un releve au serveur, et classement de l'issue.
 *
 * Trois issues, qui commandent la conduite de la file hors ligne :
 *
 *   enregistre  le serveur a le releve, on le retire de la file ;
 *   refuse      le serveur l'a lu et le refuse pour une raison qui ne
 *               changera pas en renvoyant : conflit, gel, droit, saisie
 *               invalide. On le montre a l'utilisateur, on ne renvoie pas ;
 *   reporte     le serveur n'a pas pu se prononcer : pas de reseau, erreur
 *               technique, session expiree. On garde le releve et on renvoie
 *               plus tard.
 *
 * Confondre les deux dernieres serait le defaut classique : renvoyer en
 * boucle un releve refuse, ou abandonner un releve qui n'a jamais atteint le
 * serveur.
 */

import type { ReleveSaisi } from '@/lib/releve'

export type IssueEnvoi =
  | { issue: 'enregistre'; releveId: string; statut: 'BROUILLON' | 'SOUMIS'; cree: boolean }
  | { issue: 'refuse'; message: string; champs?: Record<string, string> }
  | { issue: 'reporte'; cause: 'reseau' | 'serveur' | 'session'; message: string }

type CorpsReponse =
  | { ok: true; releveId: string; statut: 'BROUILLON' | 'SOUMIS'; cree: boolean }
  | { ok: false; code: string; message: string; champs?: Record<string, string> }

export function adresseEnvoi(projetId: string): string {
  return `/api/projet/${projetId}/releves`
}

/** Delai au-dela duquel un reseau de chantier est considere comme absent. */
const DELAI_MS = 20_000

export async function envoyerReleve(
  projetId: string,
  releve: ReleveSaisi,
  transport: typeof fetch = fetch,
): Promise<IssueEnvoi> {
  let reponse: Response
  try {
    reponse = await transport(adresseEnvoi(projetId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(releve),
      credentials: 'same-origin',
      signal: AbortSignal.timeout(DELAI_MS),
    })
  } catch {
    return {
      issue: 'reporte',
      cause: 'reseau',
      message: 'Pas de réseau : le relevé partira automatiquement au retour de la connexion.',
    }
  }
  return classer(reponse)
}

export async function classer(reponse: Response): Promise<IssueEnvoi> {
  let corps: CorpsReponse | null = null
  try {
    corps = (await reponse.json()) as CorpsReponse
  } catch {
    corps = null
  }

  if (reponse.ok && corps?.ok === true) {
    return { issue: 'enregistre', releveId: corps.releveId, statut: corps.statut, cree: corps.cree }
  }

  const message = corps && corps.ok === false ? corps.message : 'Réponse inattendue du serveur.'

  if (reponse.status === 401) {
    return { issue: 'reporte', cause: 'session', message }
  }
  if (reponse.status === 400 || reponse.status === 403 || reponse.status === 409) {
    const champs = corps && corps.ok === false ? corps.champs : undefined
    return { issue: 'refuse', message, ...(champs ? { champs } : {}) }
  }
  // 5xx, page d'erreur d'un mandataire, portail captif renvoyant du HTML :
  // le serveur ne s'est pas prononce.
  return { issue: 'reporte', cause: 'serveur', message }
}
