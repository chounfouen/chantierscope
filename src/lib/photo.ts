/**
 * Regles des photos de chantier, partagees entre navigateur et serveur.
 *
 * Compression dans le navigateur avant tout envoi : WebP, 1600 pixels sur le
 * grand cote, qualite 0,8, soit environ 120 Ko pour une photo de telephone
 * de 5 Mo. Une vignette de 400 pixels sert les listes. Sur un reseau de
 * chantier, la difference se compte en minutes.
 */

import { z } from 'zod'

export const COTE_MAX = 1600
export const COTE_VIGNETTE = 400
export const QUALITE = 0.8

/**
 * Dimensions apres reduction, proportions conservees. Une image plus petite
 * que la cible n'est jamais agrandie : cela grossirait le fichier sans
 * ajouter un seul detail.
 */
export function dimensionsCibles(
  largeur: number,
  hauteur: number,
  coteMax: number,
): { largeur: number; hauteur: number } {
  const grand = Math.max(largeur, hauteur)
  if (grand <= coteMax) return { largeur, hauteur }
  const k = coteMax / grand
  return {
    largeur: Math.max(1, Math.round(largeur * k)),
    hauteur: Math.max(1, Math.round(hauteur * k)),
  }
}

export const PreparationPhoto = z.object({
  photoId: z.uuid(),
  releveId: z.uuid(),
})

export const ConfirmationPhoto = z.object({
  releveId: z.uuid(),
  largeur: z.number().int().min(1).max(COTE_MAX),
  hauteur: z.number().int().min(1).max(COTE_MAX),
  priseLe: z.iso.datetime({ offset: true }),
  legende: z.string().trim().max(300).nullable(),
})
