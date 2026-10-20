'use server'

/** Action du registre de securite. */

import { z } from 'zod'
import { db } from '@/db/index'
import { consignerEvenement } from '@/db/mutations/sous-traitance'
import { typeEvenementSecurite } from '@/db/schema'
import { echecAction, refusAnalyse, type ResultatAction } from '@/lib/action'
import { invaliderDepuisAction } from '@/lib/cache'
import { exiger, PEUT_CONSIGNER_SECURITE } from '@/lib/garde'
import { DateSimple } from '@/lib/releve'

const Evenement = z
  .object({
    projetId: z.uuid(),
    date: DateSimple,
    type: z.enum(typeEvenementSecurite.enumValues),
    lotId: z.uuid().nullable(),
    sousTraitantId: z.uuid().nullable(),
    description: z.string().trim().min(5, 'Décrire l’événement en quelques mots.').max(2000),
    joursArret: z.number().int().min(0).max(365),
    participants: z.number().int().positive().max(1000).nullable(),
  })
  .superRefine((e, ctx) => {
    if (e.type === 'ACCIDENT_AVEC_ARRET' && e.joursArret === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['joursArret'],
        message: 'Un accident avec arrêt porte au moins un jour d’arrêt.',
      })
    }
  })

export async function consignerEvenementAction(brut: unknown): Promise<ResultatAction> {
  const e = Evenement.safeParse(brut)
  if (!e.success) return refusAnalyse(e.error, 'Événement invalide.')
  try {
    const u = await exiger(e.data.projetId, PEUT_CONSIGNER_SECURITE)
    const { projetId, ...evenement } = e.data
    await consignerEvenement(
      db(),
      projetId,
      {
        ...evenement,
        joursArret: evenement.type === 'ACCIDENT_AVEC_ARRET' ? evenement.joursArret : 0,
        participants: evenement.type === 'CAUSERIE' ? evenement.participants : null,
      },
      u.id,
    )
    invaliderDepuisAction(projetId)
    return { ok: true, message: 'Événement consigné au registre.' }
  } catch (err) {
    return echecAction(err, 'registre de sécurité')
  }
}
