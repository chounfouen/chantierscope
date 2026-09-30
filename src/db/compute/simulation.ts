/**
 * Simulation d'alea sur le planning.
 *
 * Repond a la question du conducteur de travaux : « si les fondations
 * glissent de dix jours, que se passe-t-il ? »
 *
 * La simulation est un CALCUL PUR. Elle clone le reseau en memoire, applique
 * les perturbations, relance le moteur de reseau et compare. Elle n'ecrit
 * rien en base, ce qui la rend instantanee et sans risque : un conducteur
 * peut essayer vingt scenarios avant d'en retenir un, sans jamais alterer le
 * planning de reference.
 */

import { calculerReseau } from '@/db/compute/cpm'
import { penaliteXof } from '@/db/compute/evm'
import type { Reseau, ResultatReseau, TacheReseau } from '@/db/compute/types'

/* -------------------------------------------------------------------------- */
/* Entrees                                                                    */
/* -------------------------------------------------------------------------- */

export type Perturbation = {
  /** Identifiant de la tache perturbee. */
  tache: string
  /**
   * Retard de demarrage, en jours. La tache ne peut pas commencer avant sa
   * date au plus tot de reference augmentee de ce nombre.
   */
  decalageJ?: number
  /** Allongement de la duree, en jours. */
  allongementJ?: number
}

export type JalonReseau = {
  id: string
  nom: string
  /** Tache dont la fin declenche le jalon. */
  tacheDeclenchante: string
  contractuel: boolean
}

export type ContexteSimulation = {
  reseau: Reseau
  jalons: readonly JalonReseau[]
  dureeContractuelleJ: number
  montantMarcheXof: number
  tauxPenaliteJournaliere: number
}

/* -------------------------------------------------------------------------- */
/* Sorties                                                                    */
/* -------------------------------------------------------------------------- */

export type JalonSimule = {
  id: string
  nom: string
  contractuel: boolean
  /** Jour de reference, depuis l'origine du reseau. */
  jourReference: number
  jourSimule: number
  /** Positif : le jalon glisse. */
  glissementJ: number
}

export type ResultatSimulation = {
  dureeReferenceJ: number
  dureeSimuleeJ: number
  /** Allongement du reseau. Zero si la perturbation est absorbee par les marges. */
  allongementJ: number
  /** Retard sur la duree contractuelle, apres simulation. Jamais negatif. */
  retardJ: number
  /** Retard deja constate sur le planning de reference. */
  retardReferenceJ: number
  penaliteXof: number
  /** Penalite supplementaire imputable a la perturbation. */
  penaliteSupplementaireXof: number
  jalons: JalonSimule[]
  /** Jalons contractuels qui glissent. */
  jalonsMenaces: JalonSimule[]
  /** Taches devenues critiques du fait de la perturbation. */
  devenuesCritiques: string[]
  /** Taches qui cessent de l'etre. */
  liberees: string[]
  /** Marge totale consommee, par tache, pour les taches affectees. */
  margesConsommees: { tache: string; avant: number; apres: number }[]
  reference: ResultatReseau
  simule: ResultatReseau
}

/* -------------------------------------------------------------------------- */
/* Simulation                                                                 */
/* -------------------------------------------------------------------------- */

export function simuler(
  contexte: ContexteSimulation,
  perturbations: readonly Perturbation[],
): ResultatSimulation {
  const reference = calculerReseau(contexte.reseau)

  for (const p of perturbations) {
    if (!reference.dates.has(p.tache)) {
      throw new Error(`Tache inconnue dans la simulation : ${p.tache}.`)
    }
  }

  const reseauSimule = appliquer(contexte.reseau, reference, perturbations)
  const simule = calculerReseau(reseauSimule)

  /* --- Duree et penalite ------------------------------------------------- */

  const dureeReferenceJ = reference.dureeTotale
  const dureeSimuleeJ = simule.dureeTotale
  const allongementJ = dureeSimuleeJ - dureeReferenceJ

  const retardReferenceJ = Math.max(0, dureeReferenceJ - contexte.dureeContractuelleJ)
  const retardJ = Math.max(0, dureeSimuleeJ - contexte.dureeContractuelleJ)

  const penalite = penaliteXof(retardJ, contexte.tauxPenaliteJournaliere, contexte.montantMarcheXof)
  const penaliteReference = penaliteXof(
    retardReferenceJ,
    contexte.tauxPenaliteJournaliere,
    contexte.montantMarcheXof,
  )

  /* --- Jalons -------------------------------------------------------------- */

  const jalons: JalonSimule[] = contexte.jalons.map((j) => {
    const avant = reference.dates.get(j.tacheDeclenchante)?.finTot ?? 0
    const apres = simule.dates.get(j.tacheDeclenchante)?.finTot ?? 0
    return {
      id: j.id,
      nom: j.nom,
      contractuel: j.contractuel,
      jourReference: avant,
      jourSimule: apres,
      glissementJ: apres - avant,
    }
  })

  /* --- Criticite ----------------------------------------------------------- */

  const critiquesAvant = new Set(reference.cheminCritique)
  const critiquesApres = new Set(simule.cheminCritique)
  const devenuesCritiques = [...critiquesApres].filter((id) => !critiquesAvant.has(id)).sort()
  const liberees = [...critiquesAvant].filter((id) => !critiquesApres.has(id)).sort()

  /* --- Marges consommees ---------------------------------------------------- */

  const margesConsommees = [...reference.dates.entries()]
    .map(([tache, avant]) => ({
      tache,
      avant: avant.margeTotale,
      apres: simule.dates.get(tache)?.margeTotale ?? 0,
    }))
    .filter((m) => m.avant !== m.apres)
    .sort((a, b) => a.apres - a.avant - (b.apres - b.avant))

  return {
    dureeReferenceJ,
    dureeSimuleeJ,
    allongementJ,
    retardJ,
    retardReferenceJ,
    penaliteXof: penalite,
    penaliteSupplementaireXof: penalite - penaliteReference,
    jalons,
    jalonsMenaces: jalons.filter((j) => j.contractuel && j.glissementJ > 0),
    devenuesCritiques,
    liberees,
    margesConsommees,
    reference,
    simule,
  }
}

/**
 * Clone le reseau en y appliquant les perturbations.
 *
 * Le decalage se traduit par une contrainte de debut au plus tot, calee sur
 * la date de reference de la tache. Il ne modifie ni les liaisons, ni les
 * autres taches : tout le reste du reseau reagit par propagation, ce qui est
 * exactement ce que l'on cherche a observer.
 */
function appliquer(
  reseau: Reseau,
  reference: ResultatReseau,
  perturbations: readonly Perturbation[],
): Reseau {
  const parTache = new Map<string, Perturbation>()
  for (const p of perturbations) {
    const existante = parTache.get(p.tache)
    parTache.set(p.tache, {
      tache: p.tache,
      decalageJ: (existante?.decalageJ ?? 0) + (p.decalageJ ?? 0),
      allongementJ: (existante?.allongementJ ?? 0) + (p.allongementJ ?? 0),
    })
  }

  const taches: TacheReseau[] = reseau.taches.map((t) => {
    const p = parTache.get(t.id)
    if (!p) return { ...t }

    const decalage = p.decalageJ ?? 0
    const allongement = p.allongementJ ?? 0
    const duree = t.duree + allongement
    if (duree <= 0) {
      throw new Error(
        `L allongement de ${allongement} jours rendrait la duree de ${t.id} nulle ou negative.`,
      )
    }

    const debutReference = reference.dates.get(t.id)?.debutTot ?? 0
    const debutImpose =
      decalage !== 0 ? Math.max(t.debutImpose ?? 0, debutReference + decalage) : t.debutImpose

    return debutImpose === undefined ? { ...t, duree } : { ...t, duree, debutImpose }
  })

  return { taches, liaisons: reseau.liaisons }
}
