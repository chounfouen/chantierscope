/**
 * Assemblage du tableau de bord a partir des donnees lues.
 *
 * Tout est calcule par le noyau de `src/db/compute/tableau.ts` ; ce module
 * ne fait que le brancher, pour que la page reste une mise en forme.
 */

import {
  achevement,
  alertes,
  courbePlanifiee,
  dateApres,
  prochainsJalons,
  projeterCourbe,
  projeterReseau,
  syntheseA,
  tendances,
  type Achevement,
  type Alerte,
  type JalonProjete,
  type SyntheseIndicateurs,
  type Tendances,
} from '@/db/compute/tableau'
import { tachesBudgetees, type DonneesTableau } from '@/db/queries/tableau'

export type Tableau = {
  /** Date d'etat : celle du dernier releve valide. */
  dateAnalyse: string
  indicateurs: SyntheseIndicateurs
  /** La fin projetee et la penalite, une seule pour tout l'ecran. */
  achevement: Achevement
  tendances: Tendances
  projection: {
    date: string
    vp: number | null
    va: number
    cr: number | null
  }[]
  alertes: Alerte[]
  jalons: JalonProjete[]
}

/**
 * @param aujourdhui Date du jour, pour l'age des releves en attente et
 *   l'alerte d'absence de releve. Absente, ces regles se comptent a la date
 *   d'etat.
 */
export function construireTableau(d: DonneesTableau, aujourdhui?: string): Tableau | null {
  const jourAnalyse = d.courbe.length - 1
  const situation = d.courbe[jourAnalyse]
  if (situation === undefined) return null

  const indicateurs = syntheseA(d.courbe, jourAnalyse, d.cadre)
  const courbeVp = courbePlanifiee(tachesBudgetees(d))
  const fins = projeterReseau(d.taches, d.liaisons, jourAnalyse)
  const fin = achevement({
    origine: d.origine,
    fins,
    jourAnalyse,
    dureePlanifieeJ: courbeVp.length,
    dureeContractuelleJ: d.cadre.dureeContractuelleJ,
    ecartDelaiJ: indicateurs.ecartDelaiJ,
    montantMarcheXof: d.cadre.montantMarcheXof,
    tauxPenaliteJournaliere: d.cadre.tauxPenaliteJournaliere,
    ...(d.cadre.plafondPenalite === undefined ? {} : { plafondPenalite: d.cadre.plafondPenalite }),
  })
  const projection = projeterCourbe({
    courbeVp,
    jourAnalyse,
    va: indicateurs.va,
    cr: situation.cr,
    spi: indicateurs.spi,
    cpi: indicateurs.cpi,
    ecartDelaiJ: indicateurs.ecartDelaiJ,
    coefficientDebourse: indicateurs.coefficientDebourse,
    bac: d.cadre.bacXof,
    finProjeteeJ: fin.finProjeteeJ,
  }).map((p) => ({
    date: dateApres(d.origine, p.jour),
    vp: p.vp,
    va: p.va,
    cr: p.cr,
  }))

  // Les jours restants se comptent depuis aujourd'hui, pas depuis la date
  // d'etat : un jalon dans neuf jours l'est quelle que soit la date du
  // dernier releve valide.
  const jalons = prochainsJalons(d.jalons, fins, d.origine, aujourdhui ?? situation.date)

  return {
    dateAnalyse: situation.date,
    indicateurs,
    achevement: fin,
    tendances: tendances(d.courbe, d.cadre),
    projection,
    jalons,
    alertes: alertes({
      origine: d.origine,
      dateAnalyse: situation.date,
      ...(aujourdhui === undefined ? {} : { aujourdhui }),
      taches: d.taches,
      jalons,
      aleas: d.aleas,
      releves: d.releves,
      lignes: d.lignes,
      lotParTache: new Map(d.taches.map((t) => [t.id, t.lotId])),
    }),
  }
}
