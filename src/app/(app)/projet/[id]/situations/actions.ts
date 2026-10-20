'use server'

/** Actions des decomptes : presentation par l'entreprise, decision du maitre d'oeuvre. */

import { z } from 'zod'
import { db } from '@/db/index'
import { presenterDecompte, statuerDecompte } from '@/db/mutations/decompte'
import { echecAction, refusAnalyse, type ResultatAction } from '@/lib/action'
import { invaliderDepuisAction } from '@/lib/cache'
import { aujourdhui, fcfa } from '@/lib/format'
import { exiger, PEUT_ACCEPTER_DECOMPTE, PEUT_PRESENTER_DECOMPTE } from '@/lib/garde'

const Mois = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mois attendu au format AAAA-MM.')

const Presentation = z.object({ projetId: z.uuid(), mois: Mois })

export async function presenterDecompteAction(brut: unknown): Promise<ResultatAction> {
  const p = Presentation.safeParse(brut)
  if (!p.success) return refusAnalyse(p.error, 'Mois invalide.')
  try {
    const u = await exiger(p.data.projetId, PEUT_PRESENTER_DECOMPTE)
    const r = await presenterDecompte(db(), p.data.projetId, p.data.mois, aujourdhui(), u.id)
    invaliderDepuisAction(p.data.projetId)
    return {
      ok: true,
      message: `Situation n° ${r.numero} présentée : ${fcfa(r.aPayerXof)} à payer.`,
    }
  } catch (e) {
    return echecAction(e, 'présentation d’un décompte')
  }
}

const Decision = z.object({
  projetId: z.uuid(),
  mois: Mois,
  decision: z.enum(['ACCEPTEE', 'REJETEE']),
})

export async function statuerDecompteAction(brut: unknown): Promise<ResultatAction> {
  const d = Decision.safeParse(brut)
  if (!d.success) return refusAnalyse(d.error, 'Décision invalide.')
  try {
    const u = await exiger(d.data.projetId, PEUT_ACCEPTER_DECOMPTE)
    await statuerDecompte(db(), d.data.projetId, d.data.mois, d.data.decision, aujourdhui(), u.id)
    invaliderDepuisAction(d.data.projetId)
    return {
      ok: true,
      message:
        d.data.decision === 'ACCEPTEE'
          ? 'Décompte accepté : ses montants sont définitifs.'
          : 'Décompte rejeté : l’entreprise le présentera à nouveau.',
    }
  } catch (e) {
    return echecAction(e, 'décision sur un décompte')
  }
}
