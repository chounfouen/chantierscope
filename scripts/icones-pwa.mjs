/**
 * Icones de l'application installee, produites depuis la marque : le carre
 * jaune securite et l'immeuble de l'en-tete. A relancer si la marque change :
 *
 *   node scripts/icones-pwa.mjs
 *
 * Les teintes sont celles de `--soleil` et `--soleil-encre` (globals.css),
 * converties d'OKLCH en sRGB : un fichier PNG ne lit pas de variable CSS.
 */

import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const SOLEIL = '#fdca3a'
const ENCRE = '#412805'
const IMMEUBLE = [
  'M10 12h4',
  'M10 8h4',
  'M14 21v-3a2 2 0 0 0-4 0v3',
  'M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2',
  'M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16',
]

/**
 * `marge` : part du cote laissee libre autour du dessin. Une icone
 * « masquable » garde son motif dans le cercle central de 80 %, que tout
 * systeme peut rogner en rond, en goutte ou en carre arrondi.
 */
function svg(taille, { arrondi, marge }) {
  const motif = taille * (1 - 2 * marge)
  const echelle = motif / 24
  const decalage = taille * marge
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${taille} ${taille}">
  <rect width="${taille}" height="${taille}" rx="${taille * arrondi}" fill="${SOLEIL}"/>
  <g transform="translate(${decalage} ${decalage}) scale(${echelle})" fill="none" stroke="${ENCRE}"
     stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
    ${IMMEUBLE.map((d) => `<path d="${d}"/>`).join('')}
  </g>
</svg>`
}

const SORTIES = [
  { fichier: 'public/icones/icone-192.png', taille: 192, arrondi: 0.22, marge: 0.2 },
  { fichier: 'public/icones/icone-512.png', taille: 512, arrondi: 0.22, marge: 0.2 },
  { fichier: 'public/icones/icone-masquable-512.png', taille: 512, arrondi: 0, marge: 0.28 },
  { fichier: 'public/icones/apple-touch-icon.png', taille: 180, arrondi: 0, marge: 0.2 },
]

mkdirSync('public/icones', { recursive: true })
for (const s of SORTIES) {
  await sharp(Buffer.from(svg(s.taille, s)))
    .png()
    .toFile(s.fichier)
  console.log(`${s.fichier}  ${s.taille} px`)
}
