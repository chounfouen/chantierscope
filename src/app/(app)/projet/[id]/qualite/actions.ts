'use server'

/** Actions de la qualite : essais du beton, fiches de non-conformite. */

import { z } from 'zod'
import { db } from '@/db/index'
import {
  enregistrerEssais,
  leverNonConformite,
  ouvrirNonConformite,
  traiterNonConformite,
} from '@/db/mutations/qualite'
import { echecAction, refusAnalyse, type ResultatAction } from '@/lib/action'
import { invaliderDepuisAction } from '@/lib/cache'
import {
  exiger,
  PEUT_LEVER_NON_CONFORMITE,
  PEUT_OUVRIR_NON_CONFORMITE,
  PEUT_SAISIR_ESSAIS,
  PEUT_TRAITER_NON_CONFORMITE,
} from '@/lib/garde'
import { DateSimple } from '@/lib/releve'

const Essais = z.object({
  projetId: z.uuid(),
  coulageId: z.uuid(),
  prelevement: z.number().int().min(1).max(60),
  ageJ: z.number().int().min(1).max(365),
  dateEcrasement: DateSimple,
  resistancesMpa: z
    .array(
      z
        .number('Résistance attendue.')
        .positive('Une résistance est strictement positive.')
        .max(150, 'Au plus 150 MPa.'),
    )
    .min(1, 'Saisir au moins une éprouvette.')
    .max(6),
  laboratoire: z.string().trim().max(200).nullable(),
})

export async function enregistrerEssaisAction(brut: unknown): Promise<ResultatAction> {
  const e = Essais.safeParse(brut)
  if (!e.success) return refusAnalyse(e.error, 'Résultats invalides.')
  try {
    const u = await exiger(e.data.projetId, PEUT_SAISIR_ESSAIS)
    const { projetId, coulageId, ...essais } = e.data
    const r = await enregistrerEssais(
      db(),
      projetId,
      coulageId,
      {
        ...essais,
        resistancesMpa: essais.resistancesMpa.map((v) => Math.round(v * 10) / 10),
      },
      u.id,
    )
    invaliderDepuisAction(projetId)
    if (r.ficheOuverte !== null) {
      return {
        ok: true,
        message: `${r.conformite.motif} Fiche de non-conformité n° ${r.ficheOuverte} ouverte.`,
      }
    }
    return { ok: true, message: `Résultats enregistrés. ${r.conformite.motif}` }
  } catch (err) {
    return echecAction(err, 'essais du béton')
  }
}

const Fiche = z.object({
  projetId: z.uuid(),
  dateConstat: DateSimple,
  lotId: z.uuid().nullable(),
  titre: z.string().trim().min(5, 'Donner un titre à la fiche.').max(200),
  constat: z.string().trim().min(10, 'Décrire le constat.').max(4000),
  gravite: z.number().int().min(1).max(4),
})

export async function ouvrirNonConformiteAction(brut: unknown): Promise<ResultatAction> {
  const f = Fiche.safeParse(brut)
  if (!f.success) return refusAnalyse(f.error, 'Fiche invalide.')
  try {
    const u = await exiger(f.data.projetId, PEUT_OUVRIR_NON_CONFORMITE)
    const { projetId, ...fiche } = f.data
    const r = await ouvrirNonConformite(db(), projetId, fiche, u.id)
    invaliderDepuisAction(projetId)
    return { ok: true, message: `Fiche de non-conformité n° ${r.numero} ouverte.` }
  } catch (err) {
    return echecAction(err, 'ouverture d’une non-conformité')
  }
}

const Traitement = z.object({
  projetId: z.uuid(),
  ficheId: z.uuid(),
  cause: z.string().trim().min(5, 'Nommer la cause.').max(2000),
  action: z.string().trim().min(5, 'Décrire l’action corrective.').max(2000),
  date: DateSimple,
})

export async function traiterNonConformiteAction(brut: unknown): Promise<ResultatAction> {
  const t = Traitement.safeParse(brut)
  if (!t.success) return refusAnalyse(t.error, 'Traitement invalide.')
  try {
    const u = await exiger(t.data.projetId, PEUT_TRAITER_NON_CONFORMITE)
    const { projetId, ficheId, ...traitement } = t.data
    await traiterNonConformite(db(), projetId, ficheId, traitement, u.id)
    invaliderDepuisAction(projetId)
    return { ok: true, message: 'Traitement consigné. La fiche attend sa levée.' }
  } catch (err) {
    return echecAction(err, 'traitement d’une non-conformité')
  }
}

const Levee = z.object({ projetId: z.uuid(), ficheId: z.uuid(), date: DateSimple })

export async function leverNonConformiteAction(brut: unknown): Promise<ResultatAction> {
  const l = Levee.safeParse(brut)
  if (!l.success) return refusAnalyse(l.error, 'Levée invalide.')
  try {
    const u = await exiger(l.data.projetId, PEUT_LEVER_NON_CONFORMITE)
    await leverNonConformite(db(), l.data.projetId, l.data.ficheId, l.data.date, u.id)
    invaliderDepuisAction(l.data.projetId)
    return { ok: true, message: 'Non-conformité levée.' }
  } catch (err) {
    return echecAction(err, 'levée d’une non-conformité')
  }
}
