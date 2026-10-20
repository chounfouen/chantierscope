/**
 * Calendrier de travail du reseau : jours ouvres comptes en indices de jour.
 *
 * Une tache peut etre planifiee en jours OUVRES : sa duree compte les seules
 * journees de travail, et le calcul de reseau l'etale sur le calendrier, en
 * sautant dimanches et jours feries. Les delais technologiques (sechage,
 * cure du beton avant decoffrage) restent en jours calendaires : ils portent
 * sur les liaisons, dont le decalage est toujours calendaire, ou sur des
 * taches laissees en jours calendaires. Le delai contractuel l'est aussi.
 *
 * Le calendrier est indexe comme le reseau : jour 0 a l'origine. Il est
 * memorise, car le calcul de reseau l'interroge des milliers de fois.
 *
 * Fonctions pures.
 */

import { addDays, formatISO, parseISO } from 'date-fns'
import { estOuvrable, type OptionsCalendrier } from '@/db/compute/calendrier'

export type CalendrierTravail = {
  ouvrable: (jour: number) => boolean
  /** Premier jour ouvrable a partir de `jour`, lui compris. */
  suivant: (jour: number) => number
  /** Dernier jour ouvrable jusqu'a `jour`, lui compris. */
  precedent: (jour: number) => number
  /** Jours ouvrables de `de` a `a`, bornes incluses ; zero si a < de. */
  compter: (de: number, a: number) => number
}

/** Au-dela, un calendrier sans aucun jour ouvrable est une erreur de saisie. */
const RECHERCHE_MAX = 3_650

export function calendrierDepuis(
  origine: string,
  options: OptionsCalendrier = {},
): CalendrierTravail {
  const memo = new Map<number, boolean>()
  const base = parseISO(origine)
  const ouvrable = (jour: number): boolean => {
    let v = memo.get(jour)
    if (v === undefined) {
      v = estOuvrable(formatISO(addDays(base, jour), { representation: 'date' }), options)
      memo.set(jour, v)
    }
    return v
  }
  return calendrierDe(ouvrable)
}

/** Calendrier defini par sa seule fonction d'ouverture : pour les tests. */
export function calendrierDe(ouvrable: (jour: number) => boolean): CalendrierTravail {
  const suivant = (jour: number) => {
    for (let j = jour; j < jour + RECHERCHE_MAX; j++) if (ouvrable(j)) return j
    throw new Error('Calendrier sans jour ouvrable.')
  }
  const precedent = (jour: number) => {
    for (let j = jour; j > jour - RECHERCHE_MAX; j--) if (ouvrable(j)) return j
    throw new Error('Calendrier sans jour ouvrable.')
  }
  const compter = (de: number, a: number) => {
    let n = 0
    for (let j = de; j <= a; j++) if (ouvrable(j)) n++
    return n
  }
  return { ouvrable, suivant, precedent, compter }
}

/**
 * Fin d'une tache ouvree de `duree` jours commencant au plus tot le jour
 * `debut` : le debut est porte au premier jour ouvrable, la fin est le
 * dernier des `duree` jours ouvrables. Bornes incluses.
 */
export function etaler(
  c: CalendrierTravail,
  debut: number,
  duree: number,
): { debut: number; fin: number } {
  const d = c.suivant(debut)
  let fin = d
  let restants = duree - 1
  while (restants > 0) {
    fin = c.suivant(fin + 1)
    restants--
  }
  return { debut: d, fin }
}

/** Symetrique : debut d'une tache ouvree qui doit finir au plus tard le jour `fin`. */
export function etalerAvant(
  c: CalendrierTravail,
  fin: number,
  duree: number,
): { debut: number; fin: number } {
  const f = c.precedent(fin)
  let debut = f
  let restants = duree - 1
  while (restants > 0) {
    debut = c.precedent(debut - 1)
    restants--
  }
  return { debut, fin: f }
}
