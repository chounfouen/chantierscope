'use server'

/**
 * Actions d'edition du planning. Reservees aux roles qui planifient ; chaque
 * action commence par la garde, la Server Action etant joignable par une
 * requete directe. Les entrees sont analysees ici, les regles metier
 * appliquees par les mutations.
 */

import { invaliderDepuisAction } from '@/lib/cache'
import { z } from 'zod'
import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { ajouterLiaison, modifierTachePlanning, supprimerLiaison } from '@/db/mutations/planning'
import { typeLiaison } from '@/db/schema'
import { exiger, NonAuthentifie, NonAutorise, PEUT_PLANIFIER } from '@/lib/garde'
import { DateSimple } from '@/lib/releve'

export type ResultatPlanning = { ok: true; message: string } | { ok: false; message: string }

function echec(e: unknown): ResultatPlanning {
  if (e instanceof RefusMetier) return { ok: false, message: e.message }
  if (e instanceof NonAuthentifie)
    return { ok: false, message: 'Session expirée : se reconnecter.' }
  if (e instanceof NonAutorise) {
    return { ok: false, message: 'Seul le conducteur de travaux modifie le planning.' }
  }
  console.error('Échec d’une modification du planning', e)
  return { ok: false, message: 'Modification impossible pour le moment.' }
}

function message(dureeReseauJ: number, avertissement: string | null): string {
  return avertissement ?? `Planning recalé. Durée du réseau : ${dureeReseauJ} jours.`
}

const Modification = z.object({
  projetId: z.uuid(),
  tacheId: z.uuid(),
  dureeJ: z.number().int().min(1).max(2000).optional(),
  debutImpose: DateSimple.nullable().optional(),
})

export async function modifierTacheAction(brut: unknown): Promise<ResultatPlanning> {
  const m = Modification.safeParse(brut)
  if (!m.success) return { ok: false, message: 'Modification invalide.' }
  try {
    const u = await exiger(m.data.projetId, PEUT_PLANIFIER)
    const r = await modifierTachePlanning(
      db(),
      m.data.projetId,
      m.data.tacheId,
      {
        ...(m.data.dureeJ !== undefined ? { dureeJ: m.data.dureeJ } : {}),
        ...(m.data.debutImpose !== undefined ? { debutImpose: m.data.debutImpose } : {}),
      },
      u.id,
    )
    invaliderDepuisAction(m.data.projetId)
    return { ok: true, message: message(r.dureeReseauJ, r.avertissement) }
  } catch (e) {
    return echec(e)
  }
}

const Liaison = z.object({
  projetId: z.uuid(),
  amontId: z.uuid(),
  avalId: z.uuid(),
  type: z.enum(typeLiaison.enumValues),
  decalageJ: z.number().int().min(-365).max(365),
})

export async function ajouterLiaisonAction(brut: unknown): Promise<ResultatPlanning> {
  const l = Liaison.safeParse(brut)
  if (!l.success) return { ok: false, message: 'Liaison invalide.' }
  try {
    const u = await exiger(l.data.projetId, PEUT_PLANIFIER)
    const { projetId, ...liaison } = l.data
    const r = await ajouterLiaison(db(), projetId, liaison, u.id)
    invaliderDepuisAction(projetId)
    return { ok: true, message: message(r.dureeReseauJ, null) }
  } catch (e) {
    return echec(e)
  }
}

export async function supprimerLiaisonAction(brut: unknown): Promise<ResultatPlanning> {
  const s = z.object({ projetId: z.uuid(), liaisonId: z.uuid() }).safeParse(brut)
  if (!s.success) return { ok: false, message: 'Liaison invalide.' }
  try {
    const u = await exiger(s.data.projetId, PEUT_PLANIFIER)
    const r = await supprimerLiaison(db(), s.data.projetId, s.data.liaisonId, u.id)
    invaliderDepuisAction(s.data.projetId)
    return { ok: true, message: message(r.dureeReseauJ, null) }
  } catch (e) {
    return echec(e)
  }
}
