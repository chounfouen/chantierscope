/**
 * Assemblage du rapport hebdomadaire.
 *
 * Toutes les valeurs passent par le noyau de calcul et les formats de
 * `src/lib/format.ts` : le rapport dit exactement ce que dit l'ecran, a la
 * date de fin de la periode.
 */

import sharp from 'sharp'
import { effectifs } from '@/db/compute/analyses'
import { faitsMarquants, semaineFinissantLe, type Periode } from '@/db/compute/rapport'
import { dateApres, jourDepuis, syntheseA, type SyntheseIndicateurs } from '@/db/compute/tableau'
import type { db as instanceDb } from '@/db/index'
import { chargerAnalyses } from '@/db/queries/analyses'
import { chargerSynthese, type EnTeteProjet } from '@/db/queries/lecture'
import { chargerPeriode, type DonneesPeriode } from '@/db/queries/rapport'
import { chargerTableau } from '@/db/queries/tableau'
import { lireFichier } from '@/services/stockage'

type Db = ReturnType<typeof instanceDb>

export type PhotoRapport = {
  date: string
  legende: string
  /** JPEG, seul format que le moteur PDF embarque avec PNG. */
  jpeg: Buffer
  largeur: number
  hauteur: number
}

export type ContenuRapport = {
  projet: EnTeteProjet
  periode: Periode
  interne: boolean
  /** Indicateurs en fin de periode, et la veille de son debut. */
  fin: SyntheseIndicateurs
  debut: SyntheseIndicateurs
  faits: string[]
  periodeLue: DonneesPeriode
  effectifs: { date: string; reel: number; prevu: number }[]
  photos: PhotoRapport[]
  dateFinProjetee: string | null
}

export class PeriodeHorsSituation extends Error {}

async function enJpeg(
  chemin: string,
): Promise<{ jpeg: Buffer; largeur: number; hauteur: number } | null> {
  const octets = await lireFichier(chemin)
  if (!octets) return null
  try {
    const { data, info } = await sharp(octets, { density: 96 })
      .resize({ width: 900, withoutEnlargement: true })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
    return { jpeg: data, largeur: info.width, hauteur: info.height }
  } catch {
    // Une image illisible ne doit pas empecher le rapport : elle est omise.
    return null
  }
}

/**
 * @param fin Dernier jour de la periode ; par defaut la date de la situation.
 *   Il ne peut pas la depasser : il n'y a pas d'instantane au-dela.
 */
export async function assemblerRapport(
  db: Db,
  projetId: string,
  interne: boolean,
  fin?: string,
): Promise<ContenuRapport | null> {
  const [synthese, tableau] = await Promise.all([
    chargerSynthese(db, projetId, interne),
    chargerTableau(db, projetId, interne),
  ])
  if (synthese.dateAnalyse === null || tableau.courbe.length === 0) return null
  const dateFin = fin ?? synthese.dateAnalyse
  if (dateFin > synthese.dateAnalyse || dateFin < synthese.projet.dateOrdreService) {
    throw new PeriodeHorsSituation(
      `La période doit s’achever entre l’ordre de service et la situation du ${synthese.dateAnalyse}.`,
    )
  }

  const periode = semaineFinissantLe(dateFin)
  const iFin = jourDepuis(tableau.origine, dateFin)
  const iDebut = Math.max(0, jourDepuis(tableau.origine, periode.debut) - 1)
  const indFin = syntheseA(tableau.courbe, iFin, tableau.cadre)
  const indDebut = syntheseA(tableau.courbe, iDebut, tableau.cadre)

  const [periodeLue, analyses] = await Promise.all([
    chargerPeriode(db, projetId, periode, interne),
    interne ? chargerAnalyses(db, projetId, true) : Promise.resolve(null),
  ])

  const effectif: ContenuRapport['effectifs'] = []
  if (analyses) {
    const serie = effectifs(analyses.releves, analyses.equipes, iFin, 0)
    for (let j = Math.max(0, jourDepuis(tableau.origine, periode.debut)); j <= iFin; j++) {
      const p = serie[j]
      if (p)
        effectif.push({ date: dateApres(tableau.origine, j), reel: p.reel ?? 0, prevu: p.prevu })
    }
  }

  const photos = (
    await Promise.all(
      periodeLue.photos.map(async (p) => {
        const image = await enJpeg(p.chemin)
        return image === null
          ? null
          : { date: p.date, legende: p.pointDeVue ?? p.legende ?? 'Prise de vue', ...image }
      }),
    )
  ).filter((p): p is PhotoRapport => p !== null)

  const nonTravaillees = new Set(
    periodeLue.journees.filter((j) => !j.journeeTravaillee).map((j) => j.date),
  ).size

  return {
    projet: synthese.projet,
    periode,
    interne,
    fin: indFin,
    debut: indDebut,
    faits: faitsMarquants({
      periode,
      taches: periodeLue.taches,
      jalonsAtteints: periodeLue.jalonsAtteints,
      aleas: periodeLue.aleas,
      avancementDebut: indDebut.avancement,
      avancementFin: indFin.avancement,
      avancementPrevuFin: indFin.avancementPrevu,
      journeesNonTravaillees: nonTravaillees,
    }),
    periodeLue,
    effectifs: effectif,
    photos,
    dateFinProjetee:
      indFin.dureeProjeteeJ === null ? null : dateApres(tableau.origine, indFin.dureeProjeteeJ - 1),
  }
}
