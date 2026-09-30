/**
 * Fabrication des planches photographiques de demonstration.
 *
 * Ce ne sont pas des photographies : ce sont des vignettes SVG generees, qui
 * representent l'etat du batiment au fil du temps depuis un point de vue
 * donne. Elles sont volontairement schematiques, et portent la mention
 * « image de demonstration » pour qu'aucun lecteur ne les prenne pour un
 * releve photographique reel.
 *
 * Leur role est de rendre la timeline comparative du sprint 8 demontrable
 * sans avoir a se procurer de vraies photographies de chantier.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type PlanchePhoto = {
  pointDeVue: string
  date: string
  /** Avancement du gros oeuvre a cette date, de 0 a 1. */
  avancement: number
  chemin: string
  cheminVignette: string
  largeur: number
  hauteur: number
  octets: number
  legende: string
}

const DOSSIER = join(process.cwd(), 'public', 'uploads', 'demo')
const LARGEUR = 1200
const HAUTEUR = 800

/** Teintes fixes de la planche. Hors palette de l'application : ce n'est pas une donnee. */
const CIEL_HAUT = '#bcd7ee'
const CIEL_BAS = '#e7eef4'
const SOL = '#c9c2b2'
const BETON = '#c4c2bd'
const BETON_OMBRE = '#a8a6a1'
const OUVERTURE = '#6d7a85'
const GRUE = '#d8892f'
const ENCRE = '#3a3a38'

function planche(nom: string, date: string, avancement: number, niveaux: number): string {
  const niveauxFaits = Math.floor(avancement * niveaux)
  const partiel = avancement * niveaux - niveauxFaits

  const hauteurNiveau = 95
  const solY = 640
  const gauche = 300
  const largeurBat = 600

  const etages: string[] = []
  for (let n = 0; n < niveaux; n++) {
    const complet = n < niveauxFaits
    const enCours = n === niveauxFaits && partiel > 0.05
    if (!complet && !enCours) continue

    const h = complet ? hauteurNiveau : hauteurNiveau * partiel
    const y = solY - (n + 1) * hauteurNiveau + (hauteurNiveau - h)

    etages.push(
      `<rect x="${gauche}" y="${y}" width="${largeurBat}" height="${h}" fill="${complet ? BETON : BETON_OMBRE}" />`,
    )
    if (complet) {
      for (let f = 0; f < 6; f++) {
        const fx = gauche + 40 + f * 92
        etages.push(
          `<rect x="${fx}" y="${solY - (n + 1) * hauteurNiveau + 24}" width="52" height="46" fill="${OUVERTURE}" opacity="0.75" />`,
        )
      }
      etages.push(
        `<rect x="${gauche}" y="${solY - (n + 1) * hauteurNiveau}" width="${largeurBat}" height="6" fill="${BETON_OMBRE}" />`,
      )
    }
  }

  const hauteurGrue = solY - niveaux * hauteurNiveau - 90

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${HAUTEUR}" viewBox="0 0 ${LARGEUR} ${HAUTEUR}" role="img" aria-label="Image de demonstration : ${nom}, ${date}">
  <defs>
    <linearGradient id="ciel" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${CIEL_HAUT}" />
      <stop offset="1" stop-color="${CIEL_BAS}" />
    </linearGradient>
  </defs>
  <rect width="${LARGEUR}" height="${HAUTEUR}" fill="url(#ciel)" />
  <rect x="0" y="${solY}" width="${LARGEUR}" height="${HAUTEUR - solY}" fill="${SOL}" />
  <g>${etages.join('')}</g>
  <g stroke="${GRUE}" stroke-width="7" fill="none">
    <line x1="960" y1="${solY}" x2="960" y2="${hauteurGrue}" />
    <line x1="700" y1="${hauteurGrue}" x2="1090" y2="${hauteurGrue}" />
    <line x1="960" y1="${hauteurGrue}" x2="1060" y2="${hauteurGrue - 62}" />
    <line x1="960" y1="${hauteurGrue}" x2="760" y2="${hauteurGrue - 62}" />
  </g>
  <g font-family="system-ui, sans-serif" fill="${ENCRE}">
    <rect x="0" y="0" width="${LARGEUR}" height="72" fill="#ffffff" opacity="0.82" />
    <text x="32" y="34" font-size="22" font-weight="600">${echapper(nom)}</text>
    <text x="32" y="58" font-size="18" opacity="0.7">${date} — gros oeuvre ${Math.round(avancement * 100)} %</text>
    <text x="${LARGEUR - 32}" y="34" font-size="15" text-anchor="end" opacity="0.6">Image de demonstration</text>
    <text x="${LARGEUR - 32}" y="56" font-size="15" text-anchor="end" opacity="0.6">generee, non photographique</text>
  </g>
</svg>
`
}

function echapper(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Ecrit les planches sur le disque et renvoie leur description pour la base. */
export function fabriquerPlanches(
  pointsDeVue: readonly string[],
  dates: readonly { date: string; avancement: number }[],
): PlanchePhoto[] {
  mkdirSync(DOSSIER, { recursive: true })
  const planches: PlanchePhoto[] = []

  pointsDeVue.forEach((nom, iPdv) => {
    dates.forEach(({ date, avancement }) => {
      const svg = planche(nom, date, avancement, 4)
      const fichier = `pdv${iPdv + 1}-${date}.svg`
      writeFileSync(join(DOSSIER, fichier), svg)
      planches.push({
        pointDeVue: nom,
        date,
        avancement,
        chemin: `/uploads/demo/${fichier}`,
        cheminVignette: `/uploads/demo/${fichier}`,
        largeur: LARGEUR,
        hauteur: HAUTEUR,
        octets: Buffer.byteLength(svg),
        legende: `${nom} — etat au ${date}`,
      })
    })
  })

  return planches
}
