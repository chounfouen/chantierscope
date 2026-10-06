/**
 * Dimensions d'une image WebP, lues dans son en-tete.
 *
 * Le serveur ne croit pas le navigateur sur parole : les contours des zones
 * sont exprimes en pixels de l'image du plan, ses dimensions doivent donc
 * etre celles du fichier depose, pas celles annoncees.
 *
 * Trois variantes d'en-tete : VP8 (avec perte), VP8L (sans perte) et VP8X
 * (etendu, avec transparence ou metadonnees).
 */

export type Dimensions = { largeur: number; hauteur: number }

const ascii = (o: Uint8Array, debut: number, n: number) =>
  String.fromCharCode(...o.subarray(debut, debut + n))

export function dimensionsWebp(o: Uint8Array): Dimensions | null {
  if (o.length < 30 || ascii(o, 0, 4) !== 'RIFF' || ascii(o, 8, 4) !== 'WEBP') return null
  const morceau = ascii(o, 12, 4)
  const u = (i: number) => o[i] as number
  if (morceau === 'VP8X') {
    return {
      largeur: 1 + (u(24) | (u(25) << 8) | (u(26) << 16)),
      hauteur: 1 + (u(27) | (u(28) << 8) | (u(29) << 16)),
    }
  }
  if (morceau === 'VP8L') {
    if (u(20) !== 0x2f) return null
    const b = u(21) | (u(22) << 8) | (u(23) << 16) | (u(24) << 24)
    return { largeur: 1 + (b & 0x3fff), hauteur: 1 + ((b >>> 14) & 0x3fff) }
  }
  if (morceau === 'VP8 ') {
    // Signature de trame cle, puis largeur et hauteur sur 14 bits.
    if (u(23) !== 0x9d || u(24) !== 0x01 || u(25) !== 0x2a) return null
    return { largeur: (u(26) | (u(27) << 8)) & 0x3fff, hauteur: (u(28) | (u(29) << 8)) & 0x3fff }
  }
  return null
}
