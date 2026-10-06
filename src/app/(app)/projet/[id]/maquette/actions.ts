'use server'

/**
 * Actions de la maquette : import, retrait, rattachement des taches.
 * Reservees aux roles qui planifient ; chaque action commence par la garde.
 *
 * Le GLB va du navigateur au magasin par URL signee. A l'enregistrement, le
 * serveur relit le fichier depose et en tire lui-meme l'inventaire.
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import {
  ajouterRegles,
  enregistrerMaquette,
  retirerMaquette,
  supprimerRegle,
} from '@/db/mutations/maquette'
import { familleOuvrage } from '@/db/schema'
import { invaliderDepuisAction } from '@/lib/cache'
import { exiger, NonAuthentifie, NonAutorise, PEUT_PLANIFIER } from '@/lib/garde'
import { inventaireGlb } from '@/lib/maquette/inventaire'
import { cheminMaquette, stockage, tailleMaxDepot, type Depot } from '@/services/stockage'

export type ResultatMaquette = { ok: true; message: string } | { ok: false; message: string }

function echec(e: unknown): { ok: false; message: string } {
  if (e instanceof RefusMetier) return { ok: false, message: e.message }
  if (e instanceof NonAuthentifie)
    return { ok: false, message: 'Session expirée : se reconnecter.' }
  if (e instanceof NonAutorise) {
    return { ok: false, message: 'Seul le conducteur de travaux modifie la maquette.' }
  }
  console.error('Échec d’une modification de la maquette', e)
  return { ok: false, message: 'Modification impossible pour le moment.' }
}

const Projet = z.object({ projetId: z.uuid() })

export async function preparerImportMaquetteAction(
  brut: unknown,
): Promise<{ ok: true; fichierId: string; depot: Depot } | { ok: false; message: string }> {
  const p = Projet.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Demande invalide.' }
  try {
    await exiger(p.data.projetId, PEUT_PLANIFIER)
    const fichierId = randomUUID()
    const depot = await stockage().urlDepot(
      cheminMaquette(p.data.projetId, fichierId),
      'model/gltf-binary',
    )
    return { ok: true, fichierId, depot }
  } catch (e) {
    return echec(e)
  }
}

const Import = z.object({
  projetId: z.uuid(),
  fichierId: z.uuid(),
  nomFichier: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .transform((n) => n.split(/[\\/]/).pop() as string),
})

export async function enregistrerMaquetteAction(brut: unknown): Promise<ResultatMaquette> {
  const p = Import.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Import invalide.' }
  try {
    const u = await exiger(p.data.projetId, PEUT_PLANIFIER)
    const chemin = cheminMaquette(p.data.projetId, p.data.fichierId)
    const contenu = await stockage().lire(chemin)
    if (!contenu)
      return { ok: false, message: 'Le fichier de la maquette n’est pas arrivé : réessayer.' }
    if (contenu.byteLength > tailleMaxDepot(chemin)) {
      return { ok: false, message: 'Maquette trop lourde (50 Mo au plus une fois convertie).' }
    }
    const inv = inventaireGlb(contenu)
    if ('refus' in inv) return { ok: false, message: inv.refus }
    await enregistrerMaquette(
      db(),
      p.data.projetId,
      {
        chemin,
        octets: contenu.byteLength,
        nomFichier: p.data.nomFichier,
        schemaIfc: inv.schema,
        etages: inv.etages,
        elements: inv.elements,
      },
      u.id,
    )
    invaliderDepuisAction(p.data.projetId)
    return {
      ok: true,
      message: `Maquette importée : ${inv.elements.length} éléments sur ${inv.etages.length} étages.`,
    }
  } catch (e) {
    return echec(e)
  }
}

export async function retirerMaquetteAction(brut: unknown): Promise<ResultatMaquette> {
  const p = Projet.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Demande invalide.' }
  try {
    const u = await exiger(p.data.projetId, PEUT_PLANIFIER)
    await retirerMaquette(db(), p.data.projetId, u.id)
    invaliderDepuisAction(p.data.projetId)
    return { ok: true, message: 'Maquette retirée. Les rattachements sont conservés.' }
  } catch (e) {
    return echec(e)
  }
}

const Regles = z.object({
  projetId: z.uuid(),
  regles: z
    .array(
      z.object({
        tacheId: z.uuid(),
        famille: z.enum(familleOuvrage.enumValues),
        niveau: z.number().int().min(-50).max(500).nullable(),
        nomContient: z.string().trim().max(60).nullable(),
      }),
    )
    .min(1)
    .max(500),
})

export async function ajouterReglesAction(brut: unknown): Promise<ResultatMaquette> {
  const p = Regles.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Rattachement invalide.' }
  try {
    const u = await exiger(p.data.projetId, PEUT_PLANIFIER)
    const n = await ajouterRegles(db(), p.data.projetId, p.data.regles, u.id)
    invaliderDepuisAction(p.data.projetId)
    return {
      ok: true,
      message:
        n === 0
          ? 'Ces rattachements existaient déjà.'
          : `${n} rattachement${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}.`,
    }
  } catch (e) {
    return echec(e)
  }
}

const Suppression = z.object({ projetId: z.uuid(), regleId: z.uuid() })

export async function supprimerRegleAction(brut: unknown): Promise<ResultatMaquette> {
  const p = Suppression.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Demande invalide.' }
  try {
    const u = await exiger(p.data.projetId, PEUT_PLANIFIER)
    await supprimerRegle(db(), p.data.projetId, p.data.regleId, u.id)
    invaliderDepuisAction(p.data.projetId)
    return { ok: true, message: 'Rattachement retiré.' }
  } catch (e) {
    return echec(e)
  }
}
