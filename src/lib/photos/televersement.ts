/**
 * Televersement d'une photo en trois temps : preparation des URL signees,
 * depot direct des deux fichiers dans le magasin, confirmation.
 *
 * Meme classement des issues que pour les releves : un echec de reseau ou
 * une erreur serveur se rejoue, un refus ne se rejoue pas.
 */

import type { IssueEnvoi } from '@/lib/hors-ligne/envoi'

export type PhotoAEnvoyer = {
  id: string
  releveId: string
  image: Blob
  vignette: Blob
  largeur: number
  hauteur: number
  priseLe: string
  legende: string | null
}

type Depot = { url: string; methode: 'PUT'; entetes: Record<string, string> }

export type IssuePhoto = Exclude<IssueEnvoi, { issue: 'enregistre' }> | { issue: 'enregistre' }

function classerStatut(statut: number, message: string): IssuePhoto {
  if (statut === 401) return { issue: 'reporte', cause: 'session', message }
  if (statut >= 400 && statut < 500) return { issue: 'refuse', message }
  return { issue: 'reporte', cause: 'serveur', message }
}

export async function televerserPhoto(
  projetId: string,
  p: PhotoAEnvoyer,
  transport: typeof fetch = fetch,
): Promise<IssuePhoto> {
  try {
    const prep = await transport(`/api/projet/${projetId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoId: p.id, releveId: p.releveId }),
    })
    if (!prep.ok) {
      const m = ((await prep.json().catch(() => ({}))) as { message?: string }).message
      return classerStatut(prep.status, m ?? 'Préparation de la photo refusée.')
    }
    const { image, vignette } = (await prep.json()) as { image: Depot; vignette: Depot }

    for (const [depot, contenu] of [
      [image, p.image],
      [vignette, p.vignette],
    ] as const) {
      const r = await transport(depot.url, {
        method: depot.methode,
        headers: depot.entetes,
        body: contenu,
      })
      if (!r.ok)
        return classerStatut(r.status >= 500 ? r.status : 500, 'Dépôt de la photo interrompu.')
    }

    const conf = await transport(`/api/projet/${projetId}/photos/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        releveId: p.releveId,
        largeur: p.largeur,
        hauteur: p.hauteur,
        priseLe: p.priseLe,
        legende: p.legende,
      }),
    })
    if (!conf.ok) {
      const m = ((await conf.json().catch(() => ({}))) as { message?: string }).message
      return classerStatut(conf.status, m ?? 'Enregistrement de la photo refusé.')
    }
    return { issue: 'enregistre' }
  } catch {
    return {
      issue: 'reporte',
      cause: 'reseau',
      message: 'Pas de réseau : la photo partira plus tard.',
    }
  }
}
