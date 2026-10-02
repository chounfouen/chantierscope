/**
 * Assemblage du tableau de bord a partir des donnees lues.
 *
 * Tout est calcule par le noyau de `src/db/compute/tableau.ts` ; ce module
 * ne fait que le brancher, pour que la page reste une mise en forme.
 */

import {
  alertes,
  courbePlanifiee,
  dateApres,
  prochainsJalons,
  projeterCourbe,
  projeterReseau,
  syntheseA,
  tendances,
  type Alerte,
  type JalonProjete,
  type SyntheseIndicateurs,
  type Tendances,
} from '@/db/compute/tableau'
import { tachesBudgetees, type DonneesTableau } from '@/db/queries/tableau'

export type Tableau = {
  dateAnalyse: string
  indicateurs: SyntheseIndicateurs
  tendances: Tendances
  projection: { date: string; vp: number | null; va: number; cr: number | null }[]
  alertes: Alerte[]
  jalons: JalonProjete[]
}

export function construireTableau(d: DonneesTableau): Tableau | null {
  const jourAnalyse = d.courbe.length - 1
  const situation = d.courbe[jourAnalyse]
  if (situation === undefined) return null

  const indicateurs = syntheseA(d.courbe, jourAnalyse, d.cadre)
  const projection = projeterCourbe({
    courbeVp: courbePlanifiee(tachesBudgetees(d)),
    jourAnalyse,
    va: indicateurs.va,
    cr: situation.cr,
    spi: indicateurs.spi,
    cpi: indicateurs.cpi,
    ecartDelaiJ: indicateurs.ecartDelaiJ,
    coefficientDebourse: indicateurs.coefficientDebourse,
    bac: d.cadre.bacXof,
  }).map((p) => ({ date: dateApres(d.origine, p.jour), vp: p.vp, va: p.va, cr: p.cr }))

  const fins = projeterReseau(d.taches, d.liaisons, jourAnalyse)
  const jalons = prochainsJalons(d.jalons, fins, d.origine, situation.date)

  return {
    dateAnalyse: situation.date,
    indicateurs,
    tendances: tendances(d.courbe, d.cadre),
    projection,
    jalons,
    alertes: alertes({
      origine: d.origine,
      dateAnalyse: situation.date,
      taches: d.taches,
      jalons,
      aleas: d.aleas,
      releves: d.releves,
      lignes: d.lignes,
      lotParTache: new Map(d.taches.map((t) => [t.id, t.lotId])),
    }),
  }
}
