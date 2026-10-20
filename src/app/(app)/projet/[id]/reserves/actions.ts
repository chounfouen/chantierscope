'use server'

/** Actions de la reception : reserves et prononce. */

import { z } from 'zod'
import { db } from '@/db/index'
import { constaterReserve, leverReserve, prononcerReception } from '@/db/mutations/reception'
import { phaseReserve } from '@/db/schema'
import { echecAction, refusAnalyse, type ResultatAction } from '@/lib/action'
import { invaliderDepuisAction } from '@/lib/cache'
import {
  exiger,
  PEUT_CONSTATER_RESERVE,
  PEUT_LEVER_RESERVE,
  PEUT_PRONONCER_RECEPTION,
} from '@/lib/garde'
import { DateSimple } from '@/lib/releve'

const Reserve = z.object({
  projetId: z.uuid(),
  phase: z.enum(phaseReserve.enumValues),
  zoneId: z.uuid().nullable(),
  lotId: z.uuid().nullable(),
  description: z.string().trim().min(5, 'Décrire la réserve.').max(2000),
  constateeLe: DateSimple,
  echeance: DateSimple.nullable(),
})

export async function constaterReserveAction(brut: unknown): Promise<ResultatAction> {
  const r = Reserve.safeParse(brut)
  if (!r.success) return refusAnalyse(r.error, 'Réserve invalide.')
  try {
    const u = await exiger(r.data.projetId, PEUT_CONSTATER_RESERVE)
    const { projetId, ...reserve } = r.data
    const { numero } = await constaterReserve(db(), projetId, reserve, u.id)
    invaliderDepuisAction(projetId)
    return { ok: true, message: `Réserve n° ${numero} consignée.` }
  } catch (e) {
    return echecAction(e, 'constat d’une réserve')
  }
}

const Levee = z.object({ projetId: z.uuid(), reserveId: z.uuid(), date: DateSimple })

export async function leverReserveAction(brut: unknown): Promise<ResultatAction> {
  const l = Levee.safeParse(brut)
  if (!l.success) return refusAnalyse(l.error, 'Levée invalide.')
  try {
    const u = await exiger(l.data.projetId, PEUT_LEVER_RESERVE)
    await leverReserve(db(), l.data.projetId, l.data.reserveId, l.data.date, u.id)
    invaliderDepuisAction(l.data.projetId)
    return { ok: true, message: 'Réserve levée.' }
  } catch (e) {
    return echecAction(e, 'levée d’une réserve')
  }
}

const Prononce = z.object({ projetId: z.uuid(), date: DateSimple })

export async function prononcerReceptionAction(brut: unknown): Promise<ResultatAction> {
  const p = Prononce.safeParse(brut)
  if (!p.success) return refusAnalyse(p.error, 'Date invalide.')
  try {
    const u = await exiger(p.data.projetId, PEUT_PRONONCER_RECEPTION)
    await prononcerReception(db(), p.data.projetId, p.data.date, u.id)
    invaliderDepuisAction(p.data.projetId)
    return { ok: true, message: 'Réception prononcée. La garantie de parfait achèvement court.' }
  } catch (e) {
    return echecAction(e, 'prononcé de la réception')
  }
}
