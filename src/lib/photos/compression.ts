'use client'

/**
 * Compression d'une photo dans le navigateur, avant tout envoi.
 *
 * `createImageBitmap` avec `imageOrientation: 'from-image'` applique
 * l'orientation EXIF : une photo prise telephone tourne arrive droite. Le
 * reencodage en WebP efface au passage les metadonnees EXIF, coordonnees GPS
 * comprises, qui n'ont pas a quitter le telephone a l'insu de l'utilisateur.
 */

import { COTE_MAX, COTE_VIGNETTE, QUALITE, dimensionsCibles } from '@/lib/photo'

export type PhotoCompressee = {
  image: Blob
  vignette: Blob
  largeur: number
  hauteur: number
  /** Instant de prise de vue, a defaut celui de la derniere modification du fichier. */
  priseLe: string
}

async function encoder(
  source: ImageBitmap,
  coteMax: number,
): Promise<{ blob: Blob; largeur: number; hauteur: number }> {
  const { largeur, hauteur } = dimensionsCibles(source.width, source.height, coteMax)
  const toile = document.createElement('canvas')
  toile.width = largeur
  toile.height = hauteur
  const ctx = toile.getContext('2d')
  if (!ctx) throw new Error('Compression impossible sur ce navigateur.')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, largeur, hauteur)
  const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/webp', QUALITE))
  if (!blob || blob.type !== 'image/webp') {
    throw new Error('Ce navigateur ne sait pas produire d’image WebP.')
  }
  return { blob, largeur, hauteur }
}

export async function compresser(fichier: File): Promise<PhotoCompressee> {
  const source = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  try {
    const image = await encoder(source, COTE_MAX)
    const vignette = await encoder(source, COTE_VIGNETTE)
    return {
      image: image.blob,
      vignette: vignette.blob,
      largeur: image.largeur,
      hauteur: image.hauteur,
      priseLe: new Date(fichier.lastModified || Date.now()).toISOString(),
    }
  } finally {
    source.close()
  }
}
