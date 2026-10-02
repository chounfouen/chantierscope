/**
 * Reception d'un releve journalier saisi.
 *
 * Point d'entree unique des envois, qu'ils partent directement du formulaire
 * ou de la file hors ligne au retour du reseau. Un gestionnaire de route est
 * prefere a une Server Action pour cette raison precise : l'identifiant d'une
 * action est lie a la construction deployee, et un releve reste en file
 * pendant un redeploiement ne pourrait plus l'invoquer. Une adresse stable,
 * elle, survit aux versions.
 *
 * Les codes de reponse disent a la file quoi faire :
 *
 *   200  enregistre, a retirer de la file ;
 *   400  charge utile invalide, a montrer a l'utilisateur, inutile de renvoyer ;
 *   401  session expiree, a renvoyer apres reconnexion ;
 *   403  droit refuse, inutile de renvoyer ;
 *   409  refus metier (conflit, gel, incoherence), inutile de renvoyer ;
 *   500  erreur technique, a renvoyer plus tard.
 */

import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { enregistrerReleve } from '@/db/mutations/releve'
import { exiger, NonAuthentifie, NonAutorise, PEUT_SAISIR } from '@/lib/garde'
import { ReleveSaisi, erreursParChamp } from '@/lib/releve'

export const dynamic = 'force-dynamic'

export type ReponseEnvoi =
  | { ok: true; releveId: string; statut: 'BROUILLON' | 'SOUMIS'; cree: boolean }
  | { ok: false; code: string; message: string; champs?: Record<string, string> }

function refus(statut: number, code: string, message: string, champs?: Record<string, string>) {
  const corps: ReponseEnvoi = { ok: false, code, message, ...(champs ? { champs } : {}) }
  return Response.json(corps, { status: statut })
}

export async function POST(requete: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projetId } = await ctx.params

  let utilisateurId: string
  try {
    utilisateurId = (await exiger(projetId, PEUT_SAISIR)).id
  } catch (e) {
    if (e instanceof NonAuthentifie) {
      return refus(401, 'NON_AUTHENTIFIE', 'Session expirée : se reconnecter pour envoyer.')
    }
    if (e instanceof NonAutorise) {
      return refus(403, 'NON_AUTORISE', 'Ce compte ne peut pas saisir de relevé sur ce projet.')
    }
    throw e
  }

  let brut: unknown
  try {
    brut = await requete.json()
  } catch {
    return refus(400, 'INVALIDE', 'Le relevé reçu est illisible.')
  }

  const saisie = ReleveSaisi.safeParse(brut)
  if (!saisie.success) {
    return refus(
      400,
      'INVALIDE',
      'Le relevé est incomplet ou incorrect.',
      erreursParChamp(saisie.error),
    )
  }

  try {
    const r = await enregistrerReleve(db(), projetId, saisie.data, utilisateurId)
    const corps: ReponseEnvoi = { ok: true, ...r }
    return Response.json(corps)
  } catch (e) {
    if (e instanceof RefusMetier) return refus(409, e.code, e.message)
    console.error('Echec de l enregistrement d un releve', e)
    return refus(500, 'ERREUR', 'Enregistrement impossible pour le moment. Nouvel essai plus tard.')
  }
}
