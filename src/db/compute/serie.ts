/**
 * Serie de releves d'un chef de chantier : le nombre de journees ouvrables
 * consecutives, jusqu'a aujourd'hui, pour lesquelles il a transmis un
 * releve.
 *
 * Seul element de jeu de l'application, et choisi parce qu'il recompense
 * exactement ce dont le suivi a besoin : un releve chaque jour, sans trou.
 * Les dimanches et les jours feries ne cassent pas la serie, puisqu'on n'y
 * travaille pas ; la journee du jour non plus tant qu'elle n'est pas finie.
 */

import { estOuvrable } from '@/db/compute/calendrier'

const JOUR_MS = 86_400_000
const veille = (d: string) =>
  new Date(Date.parse(`${d}T00:00:00Z`) - JOUR_MS).toISOString().slice(0, 10)

/**
 * @param dates Journees couvertes par un releve de l'auteur, dans n'importe
 *   quel ordre, doublons admis.
 * @param aujourdhui Date du jour, `AAAA-MM-JJ`.
 */
export function serieDeReleves(dates: readonly string[], aujourdhui: string): number {
  const couvertes = new Set(dates)
  let jour = aujourdhui
  // La journee en cours ne casse pas la serie : on la compte si elle est
  // deja couverte, sinon on part de la veille.
  if (!couvertes.has(jour)) jour = veille(jour)

  let serie = 0
  // Garde-fou : une serie ne remonte pas au-dela de deux ans.
  for (let i = 0; i < 730; i++) {
    if (couvertes.has(jour)) serie++
    else if (estOuvrable(jour)) break
    jour = veille(jour)
  }
  return serie
}

/** Paliers felicites a l'ecran : une semaine, deux, un mois, puis chaque mois. */
export function palierAtteint(serie: number): number | null {
  const paliers = [5, 10, 20, 30]
  if (paliers.includes(serie)) return serie
  if (serie > 30 && serie % 25 === 0) return serie
  return null
}
