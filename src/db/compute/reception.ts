/**
 * Reception et garantie de parfait achevement.
 *
 * La reception, prononcee par le maitre d'ouvrage avec ou sans reserves,
 * ouvre une annee de garantie de parfait achevement : l'entreprise y repare
 * les desordres signales. A son terme, si toutes les reserves sont levees,
 * la retenue de garantie est restituee (ou la caution liberee).
 *
 * Fonctions pures.
 */

export function finGarantie(dateReception: string): string {
  const [a, m, j] = dateReception.split('-').map(Number) as [number, number, number]
  // Un an jour pour jour ; le 29 fevrier tombe au 28 l'annee suivante.
  const fin = new Date(Date.UTC(a + 1, m - 1, j))
  if (fin.getUTCMonth() !== m - 1) fin.setUTCDate(0)
  return fin.toISOString().slice(0, 10)
}

export type ReserveComptee = {
  constateeLe: string
  echeance: string | null
  leveeLe: string | null
}

export type SyntheseReserves = {
  total: number
  ouvertes: number
  levees: number
  /** Ouvertes dont l'echeance de levee est depassee. */
  enRetard: number
  /** Duree moyenne entre constat et levee, en jours, sur les reserves levees. */
  delaiMoyenLeveeJ: number | null
}

const jours = (de: string, a: string) =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000)

export function syntheseReserves(
  reserves: readonly ReserveComptee[],
  aujourdhui: string,
): SyntheseReserves {
  const levees = reserves.filter((r) => r.leveeLe !== null && r.leveeLe <= aujourdhui)
  const ouvertes = reserves.filter((r) => !levees.includes(r))
  return {
    total: reserves.length,
    ouvertes: ouvertes.length,
    levees: levees.length,
    enRetard: ouvertes.filter((r) => r.echeance !== null && r.echeance < aujourdhui).length,
    delaiMoyenLeveeJ:
      levees.length === 0
        ? null
        : levees.reduce((s, r) => s + jours(r.constateeLe, r.leveeLe as string), 0) / levees.length,
  }
}

/**
 * La retenue de garantie se restitue au terme de la garantie de parfait
 * achevement, si plus aucune reserve n'est ouverte.
 */
export function retenueRestituable(p: {
  dateReception: string | null
  reservesOuvertes: number
  aujourdhui: string
}): boolean {
  return (
    p.dateReception !== null &&
    p.reservesOuvertes === 0 &&
    p.aujourdhui >= finGarantie(p.dateReception)
  )
}
