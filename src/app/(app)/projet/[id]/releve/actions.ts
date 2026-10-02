'use server'

/**
 * Actions du circuit de validation : soumettre, valider, rectifier.
 *
 * Chacune commence par la garde, sans exception : une Server Action est
 * joignable par une requete POST directe, hors de l'interface. La garde porte
 * sur le projet AUQUEL APPARTIENT LE RELEVE, lu en base, et non sur un
 * identifiant de projet fourni par le navigateur, qui pourrait designer un
 * autre projet que celui du releve.
 *
 * Ces actions s'executent en ligne uniquement : la validation et la
 * rectification sont le fait du conducteur de travaux, au bureau de chantier.
 * La saisie, elle, passe par le gestionnaire de route que la file hors ligne
 * sait rejouer.
 */

import { revalidatePath } from 'next/cache'
import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import {
  projetDuReleve,
  rectifierReleve,
  soumettreReleve,
  validerReleve,
} from '@/db/mutations/releve'
import { exiger, NonAuthentifie, NonAutorise, PEUT_SAISIR, PEUT_VALIDER } from '@/lib/garde'
import { ReleveSaisi } from '@/lib/releve'
import type { Role } from '@/db/schema'

export type ResultatAction =
  { ok: true; message: string; releveId: string } | { ok: false; message: string }

async function garderReleve(releveId: string, roles: readonly Role[]) {
  const projetId = await projetDuReleve(db(), releveId)
  if (!projetId) throw new RefusMetier('INTROUVABLE', 'Relevé introuvable.')
  const utilisateur = await exiger(projetId, roles)
  return { projetId, utilisateur }
}

function echec(e: unknown): ResultatAction {
  if (e instanceof RefusMetier) return { ok: false, message: e.message }
  if (e instanceof NonAuthentifie)
    return { ok: false, message: 'Session expirée : se reconnecter.' }
  if (e instanceof NonAutorise)
    return { ok: false, message: 'Action non autorisée pour ce compte.' }
  console.error('Echec d une action sur un releve', e)
  return { ok: false, message: 'Action impossible pour le moment. Réessayer plus tard.' }
}

function rafraichir(projetId: string): void {
  revalidatePath(`/projet/${projetId}`, 'layout')
}

export async function soumettreAction(releveId: string): Promise<ResultatAction> {
  try {
    const { projetId, utilisateur } = await garderReleve(releveId, PEUT_SAISIR)
    const r = await soumettreReleve(db(), releveId, utilisateur.id)
    rafraichir(projetId)
    return {
      ok: true,
      releveId,
      message: r.modifie ? 'Relevé soumis à la validation.' : 'Ce relevé était déjà soumis.',
    }
  } catch (e) {
    return echec(e)
  }
}

export async function validerAction(releveId: string): Promise<ResultatAction> {
  try {
    const { projetId, utilisateur } = await garderReleve(releveId, PEUT_VALIDER)
    const r = await validerReleve(db(), releveId, utilisateur.id)
    rafraichir(projetId)
    return {
      ok: true,
      releveId,
      message: r.modifie
        ? 'Relevé validé. Les indicateurs du projet sont à jour.'
        : 'Ce relevé était déjà validé.',
    }
  } catch (e) {
    return echec(e)
  }
}

export async function rectifierAction(ancienId: string, brut: unknown): Promise<ResultatAction> {
  try {
    const { projetId, utilisateur } = await garderReleve(ancienId, PEUT_VALIDER)
    const saisie = ReleveSaisi.safeParse(brut)
    if (!saisie.success) return { ok: false, message: 'Le relevé rectificatif est incomplet.' }
    const r = await rectifierReleve(db(), projetId, ancienId, saisie.data, utilisateur.id)
    rafraichir(projetId)
    return {
      ok: true,
      releveId: r.nouveauId,
      message: 'Relevé rectifié. L’original est conservé comme trace.',
    }
  } catch (e) {
    return echec(e)
  }
}
