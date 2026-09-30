/**
 * Verification croisee entre deux implementations independantes.
 *
 * Le planning de reference du chantier de demonstration a ete cale par une
 * passe avant ecrite dans `src/db/seed/planning.ts`, independamment du moteur
 * de `cpm.ts`. Les deux doivent produire exactement les memes dates au plus
 * tot sur le reseau reel de 59 taches et 60 liaisons.
 *
 * C'est une verification plus forte qu'un test unitaire : deux codes ecrits
 * separement, sur un reseau de taille reelle, qui doivent concorder au jour
 * pres. Une divergence signale une erreur dans l'un des deux, sans dire
 * lequel — ce qui oblige a revenir au calcul manuel pour trancher.
 */

import { describe, expect, it } from 'vitest'
import { calculerReseau } from '@/db/compute/cpm'
import { calerPlanning } from '@/db/seed/planning'
import type { Reseau } from '@/db/compute/types'

describe('reseau reel du chantier de demonstration', () => {
  const planning = calerPlanning()
  const reseau: Reseau = {
    taches: planning.taches.map((t) => ({ id: t.code, duree: t.duree })),
    liaisons: planning.liaisons.map((l) => ({
      amont: l.amont,
      aval: l.aval,
      type: l.type,
      decalage: l.decalage,
    })),
  }
  const r = calculerReseau(reseau)

  it('le reseau reel est acyclique et se resout', () => {
    expect(r.dates.size).toBe(planning.taches.length)
  })

  it('retrouve exactement les dates de debut du planning de reference', () => {
    const divergences = planning.taches
      .filter((t) => r.dates.get(t.code)?.debutTot !== t.debut)
      .map((t) => `${t.code}: planning ${t.debut} / cpm ${r.dates.get(t.code)?.debutTot}`)
    expect(divergences).toEqual([])
  })

  it('retrouve exactement les dates de fin du planning de reference', () => {
    const divergences = planning.taches
      .filter((t) => r.dates.get(t.code)?.finTot !== t.fin)
      .map((t) => `${t.code}: planning ${t.fin} / cpm ${r.dates.get(t.code)?.finTot}`)
    expect(divergences).toEqual([])
  })

  it('retrouve la duree totale du planning de reference', () => {
    expect(r.dureeTotale).toBe(planning.dureeTotale)
  })

  it('identifie un chemin critique dont la duree egale celle du reseau', () => {
    expect(r.cheminCritique.length).toBeGreaterThan(0)
    const premier = r.dates.get(r.cheminCritique[0] as string)
    const dernier = r.dates.get(r.cheminCritique[r.cheminCritique.length - 1] as string)
    expect(premier?.debutTot).toBe(0)
    expect(dernier?.finTot).toBe(r.dureeTotale - 1)
  })

  it('le chemin critique est continu : aucune interruption entre deux taches', () => {
    // Sur un reseau sans contrainte de date imposee, les taches critiques se
    // succedent sans trou : la fin de l'une precede immediatement le debut de
    // la suivante, au decalage de liaison pres.
    const critiques = new Set(r.cheminCritique)
    const couvert = new Set<number>()
    for (const id of critiques) {
      const d = r.dates.get(id)
      if (!d) continue
      for (let j = d.debutTot; j <= d.finTot; j++) couvert.add(j)
    }
    const manquants = []
    for (let j = 0; j < r.dureeTotale; j++) if (!couvert.has(j)) manquants.push(j)
    expect(manquants).toEqual([])
  })

  it('aucune tache critique ne porte de marge', () => {
    for (const id of r.cheminCritique) {
      expect(r.dates.get(id)?.margeTotale).toBe(0)
    }
  })

  it('le gros oeuvre est sur le chemin critique', () => {
    // Attendu metier : la chaine poteaux, voiles, plancher de chaque niveau
    // commande la duree de l operation.
    const critiquesGo = r.cheminCritique.filter((c) => c.startsWith('04.'))
    expect(critiquesGo.length).toBeGreaterThanOrEqual(8)
  })
})
