'use server'

/**
 * Actions du plan interactif : import d'un fond de plan, dessin des zones.
 * Reservees aux roles qui planifient ; chaque action commence par la garde,
 * une Server Action etant joignable par une requete directe.
 *
 * L'image du plan va du navigateur au magasin par URL signee, comme une
 * photo. A l'enregistrement, le serveur relit le fichier depose : il en
 * verifie la nature et en tire lui-meme les dimensions, qui fondent le
 * repere des zones.
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { db } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { enregistrerPlan, enregistrerZone, retirerPlan, supprimerZone } from '@/db/mutations/plan'
import { formatPlan } from '@/db/schema'
import { invaliderDepuisAction } from '@/lib/cache'
import { exiger, NonAuthentifie, NonAutorise, PEUT_PLANIFIER } from '@/lib/garde'
import { dimensionsWebp } from '@/lib/plan/webp'
import { SOMMETS_MAX } from '@/lib/plan/zones'
import { cheminPlan, stockage, tailleMaxDepot, type Depot } from '@/services/stockage'

export type ResultatPlan = { ok: true; message: string } | { ok: false; message: string }

function echec(e: unknown): { ok: false; message: string } {
  if (e instanceof RefusMetier) return { ok: false, message: e.message }
  if (e instanceof NonAuthentifie)
    return { ok: false, message: 'Session expirée : se reconnecter.' }
  if (e instanceof NonAutorise) {
    return { ok: false, message: 'Seul le conducteur de travaux modifie le plan.' }
  }
  console.error('Échec d’une modification du plan', e)
  return { ok: false, message: 'Modification impossible pour le moment.' }
}

const Niveau = z.number().int().min(-9).max(199)

const Preparation = z.object({ projetId: z.uuid(), niveau: Niveau })

export async function preparerImportAction(
  brut: unknown,
): Promise<{ ok: true; planId: string; depot: Depot } | { ok: false; message: string }> {
  const p = Preparation.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Demande invalide.' }
  try {
    await exiger(p.data.projetId, PEUT_PLANIFIER)
    const planId = randomUUID()
    const depot = await stockage().urlDepot(cheminPlan(p.data.projetId, planId), 'image/webp')
    return { ok: true, planId, depot }
  } catch (e) {
    return echec(e)
  }
}

const Import = z.object({
  projetId: z.uuid(),
  planId: z.uuid(),
  niveau: Niveau,
  formatSource: z.enum(formatPlan.enumValues),
  // Le nom seul, sans chemin : il n'est qu'un rappel affiche.
  nomFichier: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .transform((n) => n.split(/[\\/]/).pop() as string),
})

export async function enregistrerPlanAction(brut: unknown): Promise<ResultatPlan> {
  const p = Import.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Import invalide.' }
  try {
    const u = await exiger(p.data.projetId, PEUT_PLANIFIER)
    const chemin = cheminPlan(p.data.projetId, p.data.planId)
    const contenu = await stockage().lire(chemin)
    if (!contenu) return { ok: false, message: 'Le fichier du plan n’est pas arrivé : réessayer.' }
    if (contenu.byteLength > tailleMaxDepot(chemin)) {
      return { ok: false, message: 'Image du plan trop lourde.' }
    }
    const dims = dimensionsWebp(contenu)
    if (!dims || dims.largeur > 8192 || dims.hauteur > 8192) {
      return { ok: false, message: 'Le fichier déposé n’est pas une image de plan valide.' }
    }
    const r = await enregistrerPlan(
      db(),
      p.data.projetId,
      {
        niveau: p.data.niveau,
        chemin,
        largeur: dims.largeur,
        hauteur: dims.hauteur,
        octets: contenu.byteLength,
        formatSource: p.data.formatSource,
        nomFichier: p.data.nomFichier,
      },
      u.id,
    )
    invaliderDepuisAction(p.data.projetId)
    return {
      ok: true,
      message:
        r.zonesRemisesAEchelle > 0
          ? `Plan importé. ${r.zonesRemisesAEchelle} zone${r.zonesRemisesAEchelle > 1 ? 's suivent' : ' suit'} le nouveau plan : vérifier ${r.zonesRemisesAEchelle > 1 ? 'leurs contours' : 'son contour'}.`
          : 'Plan importé. Dessiner maintenant les zones du niveau.',
    }
  } catch (e) {
    return echec(e)
  }
}

const Retrait = z.object({ projetId: z.uuid(), niveau: Niveau })

export async function retirerPlanAction(brut: unknown): Promise<ResultatPlan> {
  const p = Retrait.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Demande invalide.' }
  try {
    const u = await exiger(p.data.projetId, PEUT_PLANIFIER)
    await retirerPlan(db(), p.data.projetId, p.data.niveau, u.id)
    invaliderDepuisAction(p.data.projetId)
    return { ok: true, message: 'Plan retiré. Les zones du niveau sont conservées.' }
  } catch (e) {
    return echec(e)
  }
}

const Zone = z.object({
  projetId: z.uuid(),
  id: z.uuid().optional(),
  nom: z.string().trim().min(1, 'Nommer la zone.').max(120),
  niveau: Niveau,
  points: z
    .array(z.tuple([z.number().finite(), z.number().finite()]))
    .min(3)
    .max(SOMMETS_MAX),
  tacheIds: z.array(z.uuid()).max(500),
})

export async function enregistrerZoneAction(
  brut: unknown,
): Promise<({ ok: true; id: string } | { ok: false }) & { message: string }> {
  const z1 = Zone.safeParse(brut)
  if (!z1.success) {
    return { ok: false, message: z1.error.issues[0]?.message ?? 'Zone invalide.' }
  }
  try {
    const u = await exiger(z1.data.projetId, PEUT_PLANIFIER)
    const { projetId, ...zone } = z1.data
    const r = await enregistrerZone(db(), projetId, zone, u.id)
    invaliderDepuisAction(projetId)
    return { ok: true, id: r.id, message: zone.id ? 'Zone modifiée.' : 'Zone créée.' }
  } catch (e) {
    return echec(e)
  }
}

const Suppression = z.object({ projetId: z.uuid(), zoneId: z.uuid() })

export async function supprimerZoneAction(brut: unknown): Promise<ResultatPlan> {
  const p = Suppression.safeParse(brut)
  if (!p.success) return { ok: false, message: 'Demande invalide.' }
  try {
    const u = await exiger(p.data.projetId, PEUT_PLANIFIER)
    await supprimerZone(db(), p.data.projetId, p.data.zoneId, u.id)
    invaliderDepuisAction(p.data.projetId)
    return { ok: true, message: 'Zone supprimée.' }
  } catch (e) {
    return echec(e)
  }
}
