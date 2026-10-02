'use server'

/**
 * Enregistrement des scenarios de simulation. Seules les hypotheses sont
 * ecrites ; le resultat se recalcule a chaque affichage.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { enregistrerScenario, supprimerScenario } from '@/db/mutations/planning'
import { exiger, NonAuthentifie, NonAutorise, PEUT_PLANIFIER } from '@/lib/garde'

export type ResultatScenario = { ok: true; message: string } | { ok: false; message: string }

const Perturbation = z.object({
  tacheId: z.uuid(),
  decalageJ: z.number().int().min(0).max(365),
  allongementJ: z.number().int().min(0).max(365),
})

const Scenario = z.object({
  projetId: z.uuid(),
  nom: z.string().trim().min(3, 'Nommer le scénario.').max(120),
  description: z.string().trim().max(1000).nullable(),
  perturbations: z.array(Perturbation).min(1).max(50),
})

function echec(e: unknown): ResultatScenario {
  if (e instanceof RefusMetier) return { ok: false, message: e.message }
  if (e instanceof NonAuthentifie)
    return { ok: false, message: 'Session expirée : se reconnecter.' }
  if (e instanceof NonAutorise) {
    return { ok: false, message: 'Seul le conducteur de travaux enregistre un scénario.' }
  }
  console.error('Échec d’un enregistrement de scénario', e)
  return { ok: false, message: 'Enregistrement impossible pour le moment.' }
}

export async function enregistrerScenarioAction(brut: unknown): Promise<ResultatScenario> {
  const s = Scenario.safeParse(brut)
  if (!s.success) return { ok: false, message: s.error.issues[0]?.message ?? 'Scénario invalide.' }
  try {
    const u = await exiger(s.data.projetId, PEUT_PLANIFIER)
    const { projetId, ...scenario } = s.data
    await enregistrerScenario(db(), projetId, scenario, u.id)
    revalidatePath(`/projet/${projetId}/simulation`)
    return { ok: true, message: 'Scénario enregistré.' }
  } catch (e) {
    return echec(e)
  }
}

export async function supprimerScenarioAction(brut: unknown): Promise<ResultatScenario> {
  const s = z.object({ projetId: z.uuid(), scenarioId: z.uuid() }).safeParse(brut)
  if (!s.success) return { ok: false, message: 'Scénario invalide.' }
  try {
    await exiger(s.data.projetId, PEUT_PLANIFIER)
    await supprimerScenario(db(), s.data.projetId, s.data.scenarioId)
    revalidatePath(`/projet/${s.data.projetId}/simulation`)
    return { ok: true, message: 'Scénario supprimé.' }
  } catch (e) {
    return echec(e)
  }
}
