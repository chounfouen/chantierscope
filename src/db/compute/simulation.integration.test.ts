/**
 * Critere d'achevement du sprint 6 : une simulation produit une date de fin
 * et une penalite verifiables a la main.
 *
 * Scenario : le beton de proprete des fondations, tache critique par sa fin,
 * demarre avec dix jours de retard.
 *
 * Calcul manuel, a partir des donnees du marche :
 *
 *   ordre de service         2 mars 2026
 *   duree contractuelle      412 jours, fin contractuelle le 17 avril 2027
 *   reseau de reference      412 jours, aucun retard
 *   glissement               10 jours sur une tache critique par sa fin,
 *                            donc 10 jours sur la fin du reseau
 *   duree simulee            412 + 10 = 422 jours
 *   fin simulee              2 mars 2026 + 421 jours = 27 avril 2027
 *   retard                   422 - 412 = 10 jours
 *   montant du marche        1 156 141 200 FCFA
 *   taux de penalite         1 pour mille par jour
 *   penalite                 10 x 0,001 x 1 156 141 200 = 11 561 412 FCFA
 */

import { addDays, formatISO, parseISO } from 'date-fns'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { simuler } from '@/db/compute/simulation'
import { dbScript } from '@/db/index'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerPlanning, reseauDuPlanning, type Planning } from '@/db/queries/planning'
import { recompute } from '@/db/recompute'

const { db, fermer } = dbScript()
let planning: Planning

beforeAll(async () => {
  // Criticite et marges sont du cache : la base de test n'est pas recalculee
  // par le peuplement.
  const projetId = await premierProjetId(db)
  await recompute(db, projetId)
  planning = await chargerPlanning(db, projetId)
})

afterAll(async () => {
  await fermer()
})

function contexte() {
  return {
    reseau: reseauDuPlanning(planning),
    jalons: planning.jalons
      .filter((j) => j.tacheDeclenchanteId !== null)
      .map((j) => ({
        id: j.id,
        nom: j.nom,
        tacheDeclenchante: j.tacheDeclenchanteId as string,
        contractuel: j.contractuel,
      })),
    dureeContractuelleJ: planning.projet.dureeContractuelleJ,
    montantMarcheXof: planning.projet.montantMarcheXof,
    tauxPenaliteJournaliere: planning.projet.tauxPenaliteJournaliere,
  }
}

describe('dix jours de glissement sur les fondations', () => {
  it('donne la date de fin et la penalite du calcul manuel', () => {
    const fondations = planning.taches.find((t) => t.codeWbs === '03.1.1')
    expect(fondations?.critique).toBe(true)

    const r = simuler(contexte(), [{ tache: fondations?.id as string, decalageJ: 10 }])

    expect(planning.projet.montantMarcheXof).toBe(1_156_141_200)
    expect(planning.projet.tauxPenaliteJournaliere).toBe(0.001)
    expect(r.dureeReferenceJ).toBe(412)
    expect(r.dureeSimuleeJ).toBe(422)
    expect(r.retardJ).toBe(10)
    expect(r.penaliteXof).toBe(11_561_412)
    expect(r.penaliteSupplementaireXof).toBe(11_561_412)

    const fin = formatISO(
      addDays(parseISO(planning.projet.dateOrdreService), r.dureeSimuleeJ - 1),
      {
        representation: 'date',
      },
    )
    expect(fin).toBe('2027-04-27')
  })

  it('menace les jalons contractuels situes apres les fondations, et eux seuls', () => {
    const fondations = planning.taches.find((t) => t.codeWbs === '03.1.1')
    const r = simuler(contexte(), [{ tache: fondations?.id as string, decalageJ: 10 }])
    const menaces = r.jalonsMenaces.map((j) => j.nom)
    expect(menaces).toContain('Achèvement des fondations')
    expect(menaces).toContain('Réception provisoire')
    expect(menaces).not.toContain('Démarrage effectif des travaux')
    for (const j of r.jalonsMenaces) expect(j.glissementJ).toBe(10)
  })

  it('un glissement absorbe par la marge ne coute rien', () => {
    const libre = planning.taches.find((t) => t.feuille && (t.margeTotaleJ ?? 0) >= 20)
    const r = simuler(contexte(), [{ tache: libre?.id as string, decalageJ: 10 }])
    expect(r.allongementJ).toBe(0)
    expect(r.penaliteSupplementaireXof).toBe(0)
  })
})
