/**
 * Plan interactif : avancement des zones du plan, rejoue dans le temps.
 *
 * Une zone du plan regroupe les taches qui s'y executent. Son avancement est
 * celui de ces taches, pondere par leur budget, comme partout ailleurs dans
 * l'application : une zone ou le plancher est coule mais pas la maconnerie
 * n'est pas « a moitie faite » si le plancher pese trois fois plus lourd.
 *
 * La couleur d'une zone est un ETAT de la palette d'etats, jamais une teinte
 * de serie : non commence, en cours, acheve, en retard, critique. L'etat est
 * toujours accompagne de son libelle et de l'avancement chiffre.
 */

import { avancementPrevu, avancementTache } from '@/db/compute/avancement'
import type { LigneAvancement } from '@/db/compute/types'
import type { MethodeAvancement } from '@/db/schema'
import type { Etat } from '@/lib/etats'

const EPSILON = 1e-6

/** Retard d'avancement au-dela duquel une zone est dite en retard. */
export const SEUIL_RETARD_ZONE = 0.02

export type TachePlan = {
  id: string
  methode: MethodeAvancement
  debut: number
  duree: number
  critique: boolean
  lignes: (LigneAvancement & { id: string })[]
}

export type QuantitePlan = { ligneId: string; jour: number; quantite: number }

export type EtatZone = { reel: number; prevu: number; etat: Etat }

/**
 * Etat d'une zone a partir de son avancement reel et prevu.
 *
 * En retard des que le reel accuse deux points de retard sur le prevu ;
 * critique si, de plus, une de ses taches du chemin critique est elle-meme en
 * retard : le retard de la zone est alors celui du chantier.
 */
export function etatZone(reel: number, prevu: number, critique: boolean): Etat {
  if (reel >= 1 - EPSILON) return 'ACHEVE'
  if (prevu - reel > SEUIL_RETARD_ZONE) return critique ? 'CRITIQUE' : 'EN_RETARD'
  if (reel > EPSILON) return 'EN_COURS'
  return 'NON_COMMENCE'
}

/** Jours echantillonnes pour le curseur : chaque semaine, et la date d'analyse. */
export function joursEchantillonnes(jourAnalyse: number, pas = 7): number[] {
  const jours: number[] = []
  for (let j = jourAnalyse; j >= 0; j -= pas) jours.unshift(j)
  return jours
}

/**
 * Avancement de chaque zone a chacun des jours demandes.
 *
 * Les quantites sont cumulees une seule fois, en avancant dans le temps : le
 * cout est celui d'un parcours des releves, plus une evaluation des taches
 * des zones par jour echantillonne.
 *
 * @returns Pour chaque jour, dans l'ordre donne, l'etat de chaque zone.
 */
export function rejouerZones(
  zones: readonly { id: string; tacheIds: readonly string[] }[],
  taches: readonly TachePlan[],
  quantites: readonly QuantitePlan[],
  jours: readonly number[],
): Map<string, EtatZone>[] {
  const tache = new Map(taches.map((t) => [t.id, t]))
  const ligne = new Map<string, LigneAvancement>()
  // Copies de travail : les quantites realisees y sont cumulees.
  const copies = new Map(
    taches.map((t) => [
      t.id,
      {
        ...t,
        lignes: t.lignes.map((l) => {
          const c = { ...l, quantiteRealisee: 0 }
          ligne.set(l.id, c)
          return c
        }),
      },
    ]),
  )
  const triees = [...quantites].sort((a, b) => a.jour - b.jour)

  const resultat: Map<string, EtatZone>[] = []
  let k = 0
  for (const jour of [...jours].sort((a, b) => a - b)) {
    while (k < triees.length && (triees[k] as QuantitePlan).jour <= jour) {
      const q = triees[k] as QuantitePlan
      const l = ligne.get(q.ligneId)
      if (l) l.quantiteRealisee += q.quantite
      k++
    }

    const etats = new Map<string, EtatZone>()
    for (const z of zones) {
      let budget = 0
      let acquis = 0
      let prevu = 0
      let critique = false
      for (const id of z.tacheIds) {
        const t = copies.get(id)
        if (!t || !tache.has(id)) continue
        const a = avancementTache(t, jour)
        const p = avancementPrevu(t, jour)
        budget += a.budget
        acquis += a.avancement * a.budget
        prevu += p * a.budget
        // Critique si une tache du chemin critique est ELLE-MEME en retard :
        // une zone dont seule une tache a marge est en retard ne retarde pas
        // le chantier.
        critique ||= t.critique && p - a.avancement > SEUIL_RETARD_ZONE
      }
      const reel = budget > 0 ? acquis / budget : 0
      const p = budget > 0 ? prevu / budget : 0
      etats.set(z.id, { reel, prevu: p, etat: etatZone(reel, p, critique) })
    }
    resultat.push(etats)
  }
  return resultat
}
