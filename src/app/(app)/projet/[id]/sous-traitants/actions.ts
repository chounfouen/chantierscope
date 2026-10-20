'use server'

/** Actions de la sous-traitance : demande d'agrement, decision du maitre d'ouvrage. */

import { z } from 'zod'
import { db } from '@/db/index'
import { demanderAgrement, statuerAgrement } from '@/db/mutations/sous-traitance'
import { echecAction, refusAnalyse, type ResultatAction } from '@/lib/action'
import { invaliderDepuisAction } from '@/lib/cache'
import { exiger, PEUT_AGREER, PEUT_DEMANDER_AGREMENT } from '@/lib/garde'
import { DateSimple } from '@/lib/releve'

const Demande = z.object({
  projetId: z.uuid(),
  raisonSociale: z.string().trim().min(2, 'Indiquer la raison sociale.').max(200),
  specialite: z.string().trim().min(2, 'Indiquer la spécialité.').max(200),
  montantXof: z
    .number()
    .int('Montant en francs entiers.')
    .positive('Le montant sous-traité est strictement positif.')
    .max(1e13),
  paiementDirect: z.boolean(),
  demandeLe: DateSimple,
  lotIds: z.array(z.uuid()).min(1, 'Choisir au moins un lot.').max(30),
})

export async function demanderAgrementAction(brut: unknown): Promise<ResultatAction> {
  const d = Demande.safeParse(brut)
  if (!d.success) return refusAnalyse(d.error, 'Demande invalide.')
  try {
    const u = await exiger(d.data.projetId, PEUT_DEMANDER_AGREMENT)
    const { projetId, ...demande } = d.data
    await demanderAgrement(db(), projetId, demande, u.id)
    invaliderDepuisAction(projetId)
    return { ok: true, message: `Demande d’agrément de ${demande.raisonSociale} enregistrée.` }
  } catch (e) {
    return echecAction(e, 'demande d’agrément')
  }
}

const Decision = z.object({
  projetId: z.uuid(),
  sousTraitantId: z.uuid(),
  decision: z.enum(['AGREE', 'REFUSE']),
  date: DateSimple,
})

export async function statuerAgrementAction(brut: unknown): Promise<ResultatAction> {
  const d = Decision.safeParse(brut)
  if (!d.success) return refusAnalyse(d.error, 'Décision invalide.')
  try {
    const u = await exiger(d.data.projetId, PEUT_AGREER)
    await statuerAgrement(
      db(),
      d.data.projetId,
      d.data.sousTraitantId,
      d.data.decision,
      d.data.date,
      u.id,
    )
    invaliderDepuisAction(d.data.projetId)
    return {
      ok: true,
      message: d.data.decision === 'AGREE' ? 'Sous-traitant agréé.' : 'Agrément refusé.',
    }
  } catch (e) {
    return echecAction(e, 'décision d’agrément')
  }
}
