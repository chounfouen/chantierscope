import { describe, expect, it } from 'vitest'
import { calculerReseau } from '@/db/compute/cpm'
import { ATTENDU_REFERENCE } from '@/db/compute/reference'
import { reseauDuPlanning } from '@/db/queries/planning'
import { construireGantt } from '@/lib/gantt-donnees'
import { planningReference } from '@/lib/gantt-reference'

function donnees(aujourdhui = '2026-03-12') {
  const p = planningReference()
  return construireGantt(p, calculerReseau(reseauDuPlanning(p)), aujourdhui)
}

describe('donnees du Gantt sur le reseau de reference', () => {
  it('marque critiques exactement les taches du calcul manuel', () => {
    const critiques = donnees()
      .elements.filter((e) => e.critique)
      .map((e) => e.id)
    expect(critiques.sort()).toEqual([...ATTENDU_REFERENCE.cheminCritique].sort())
  })

  it('place chaque tache sur ses jours du calcul manuel', () => {
    const d = donnees()
    const f = d.elements.find((e) => e.id === 'F')
    expect([f?.debut, f?.fin]).toEqual([19, 22])
    const h = d.elements.find((e) => e.id === 'H')
    // H : au plus tot jours 23 a 24, au plus tard 26 a 27, trois jours de marge.
    expect([h?.debut, h?.fin, h?.margeTotaleJ]).toEqual([23, 24, 3])
    expect(h?.debutTard).toBe('2026-03-28')
  })

  it('cree une ligne par lot, parente des regroupements', () => {
    const d = donnees()
    const lot = d.elements.find((e) => e.genre === 'lot')
    expect(lot).toMatchObject({ id: 'lot:lot', debut: 0, fin: 34, parentId: null })
    expect(d.elements.find((e) => e.id === 'racine')?.parentId).toBe('lot:lot')
  })

  it('les liaisons critiques relient deux taches critiques', () => {
    const d = donnees()
    const critiques = d.liaisons.filter((l) => l.critique).map((l) => `${l.amontId}${l.avalId}`)
    expect(critiques.sort()).toEqual(['AB', 'BD', 'DF', 'FG', 'GI', 'IJ'])
  })

  it('situe le jour, la fin contractuelle et les jalons', () => {
    const d = donnees('2026-03-12')
    expect(d.aujourdhui).toBe(10)
    expect(d.finContractuelle).toBe(34)
    expect(d.jalons[0]).toMatchObject({ jourPrevu: 34, contractuel: true, jourReel: null })
    expect(d.nombreJours).toBeGreaterThan(35)
  })

  it('n affiche pas de ligne du jour avant l ordre de service', () => {
    expect(donnees('2026-01-01').aujourdhui).toBeNull()
  })
})

describe('Gantt simule', () => {
  it('decale la tache, sa suite et ses regroupements, et met a jour la criticite', async () => {
    const { simuler } = await import('@/db/compute/simulation')
    const { ganttSimule, fantomesDe } = await import('@/lib/gantt-donnees')
    const p = planningReference()
    const reseau = reseauDuPlanning(p)
    const ref = construireGantt(p, calculerReseau(reseau), '2026-03-12')
    // C a quatre jours de marge : six jours de retard la rendent critique et
    // allongent le reseau de deux jours.
    const s = simuler(
      {
        reseau,
        jalons: [],
        dureeContractuelleJ: 35,
        montantMarcheXof: 1,
        tauxPenaliteJournaliere: 0,
      },
      [{ tache: 'C', decalageJ: 6 }],
    )
    const g = ganttSimule(ref, s.simule)
    const c = g.elements.find((e) => e.id === 'C')
    expect([c?.debut, c?.critique]).toEqual([11, true])
    expect(g.elements.find((e) => e.id === 'J')?.fin).toBe(36)
    expect(g.elements.find((e) => e.id === 'racine')?.fin).toBe(36)
    expect(g.elements.find((e) => e.id === 'lot:lot')?.fin).toBe(36)
    // La reference est intacte, et sert de fantome.
    expect(ref.elements.find((e) => e.id === 'C')?.debut).toBe(5)
    expect(fantomesDe(ref)['C']).toEqual({ debut: 5, fin: 7 })
  })
})
