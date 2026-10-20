'use server'

/**
 * Actions du cadre contractuel : avenants, ordres de service, decisions sur
 * les intemperies. Garde en tete de chaque action, entrees analysees ici.
 */

import { z } from 'zod'
import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { ajouterAvenant, ajouterOrdreService, statuerIntemperie } from '@/db/mutations/contrat'
import { typeOrdreService } from '@/db/schema'
import { invaliderDepuisAction } from '@/lib/cache'
import {
  exiger,
  NonAuthentifie,
  NonAutorise,
  PEUT_GERER_CONTRAT,
  PEUT_STATUER_INTEMPERIE,
} from '@/lib/garde'
import { DateSimple } from '@/lib/releve'

export type ResultatContrat = { ok: true; message: string } | { ok: false; message: string }

function echec(e: unknown): ResultatContrat {
  if (e instanceof RefusMetier) return { ok: false, message: e.message }
  if (e instanceof NonAuthentifie)
    return { ok: false, message: 'Session expirée : se reconnecter.' }
  if (e instanceof NonAutorise)
    return { ok: false, message: 'Action non autorisée pour ce compte.' }
  console.error('Échec d’une action sur le contrat', e)
  return { ok: false, message: 'Action impossible pour le moment.' }
}

const Avenant = z.object({
  projetId: z.uuid(),
  date: DateSimple,
  objet: z.string().trim().min(5, 'Décrire l’objet de l’avenant.').max(300),
  montantXof: z.number().int('Montant en francs entiers.').min(-1e12).max(1e12),
  delaiJ: z.number().int('Nombre entier de jours.').min(0).max(2000),
  figerReference: z.boolean(),
})

export async function ajouterAvenantAction(brut: unknown): Promise<ResultatContrat> {
  const a = Avenant.safeParse(brut)
  if (!a.success) return { ok: false, message: a.error.issues[0]?.message ?? 'Avenant invalide.' }
  try {
    const u = await exiger(a.data.projetId, PEUT_GERER_CONTRAT)
    const { projetId, ...avenant } = a.data
    const r = await ajouterAvenant(db(), projetId, avenant, u.id)
    invaliderDepuisAction(projetId)
    return { ok: true, message: `Avenant n° ${r.numero} enregistré.` }
  } catch (e) {
    return echec(e)
  }
}

const Ordre = z.object({
  projetId: z.uuid(),
  date: DateSimple,
  type: z.enum(typeOrdreService.enumValues),
  objet: z.string().trim().min(5, 'Décrire l’objet de l’ordre de service.').max(300),
  delaiJ: z.number().int('Nombre entier de jours.').min(0).max(2000),
})

export async function ajouterOrdreServiceAction(brut: unknown): Promise<ResultatContrat> {
  const o = Ordre.safeParse(brut)
  if (!o.success) {
    return { ok: false, message: o.error.issues[0]?.message ?? 'Ordre de service invalide.' }
  }
  try {
    const u = await exiger(o.data.projetId, PEUT_GERER_CONTRAT)
    const { projetId, ...ordre } = o.data
    const r = await ajouterOrdreService(db(), projetId, ordre, u.id)
    invaliderDepuisAction(projetId)
    return { ok: true, message: `Ordre de service n° ${r.numero} enregistré.` }
  } catch (e) {
    return echec(e)
  }
}

const Decision = z.object({
  projetId: z.uuid(),
  aleaId: z.uuid(),
  decision: z.enum(['RECONNUE', 'REJETEE']),
})

export async function statuerIntemperieAction(brut: unknown): Promise<ResultatContrat> {
  const d = Decision.safeParse(brut)
  if (!d.success) return { ok: false, message: 'Décision invalide.' }
  try {
    const u = await exiger(d.data.projetId, PEUT_STATUER_INTEMPERIE)
    await statuerIntemperie(db(), d.data.projetId, d.data.aleaId, d.data.decision, u.id)
    invaliderDepuisAction(d.data.projetId)
    return {
      ok: true,
      message:
        d.data.decision === 'RECONNUE'
          ? 'Intempérie reconnue. Le délai en vigueur est à jour.'
          : 'Intempérie rejetée.',
    }
  } catch (e) {
    return echec(e)
  }
}
