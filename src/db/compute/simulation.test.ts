import { describe, expect, it } from 'vitest'
import { simuler, type ContexteSimulation } from '@/db/compute/simulation'
import { RESEAU_REFERENCE } from '@/db/compute/reference'
import { calerPlanning } from '@/db/seed/planning'

/**
 * Le reseau de reference de dix taches sert aussi aux simulations : ses
 * marges sont connues par le calcul manuel, donc l'effet d'un glissement est
 * previsible a la main.
 *
 *   marges totales : A 0, B 0, C 4, D 0, E 4, F 0, G 0, H 3, I 0, J 0
 *   duree du reseau : 35 jours
 */
const contexte: ContexteSimulation = {
  reseau: RESEAU_REFERENCE,
  jalons: [
    { id: 'j1', nom: 'Fin de la phase amont', tacheDeclenchante: 'F', contractuel: true },
    { id: 'j2', nom: 'Reception', tacheDeclenchante: 'J', contractuel: true },
    { id: 'j3', nom: 'Jalon interne', tacheDeclenchante: 'E', contractuel: false },
  ],
  dureeContractuelleJ: 35,
  montantMarcheXof: 1_000_000_000,
  tauxPenaliteJournaliere: 0.001,
}

describe('une perturbation absorbee par la marge', () => {
  // E dispose de 4 jours de marge totale et de 4 jours de marge libre.
  const r = simuler(contexte, [{ tache: 'E', decalageJ: 3 }])

  it('n allonge pas le reseau', () => {
    expect(r.allongementJ).toBe(0)
    expect(r.dureeSimuleeJ).toBe(35)
  })

  it('ne cree ni retard ni penalite', () => {
    expect(r.retardJ).toBe(0)
    expect(r.penaliteXof).toBe(0)
    expect(r.penaliteSupplementaireXof).toBe(0)
  })

  it('ne menace aucun jalon', () => {
    expect(r.jalonsMenaces).toEqual([])
  })

  it('consomme la marge de la tache decalee', () => {
    const marge = r.margesConsommees.find((m) => m.tache === 'E')
    expect(marge).toEqual({ tache: 'E', avant: 4, apres: 1 })
  })

  it('ne rend aucune tache critique', () => {
    expect(r.devenuesCritiques).toEqual([])
  })
})

describe('une perturbation qui epuise exactement la marge', () => {
  const r = simuler(contexte, [{ tache: 'E', decalageJ: 4 }])

  it('n allonge toujours pas le reseau', () => {
    expect(r.allongementJ).toBe(0)
  })

  it('rend la tache critique', () => {
    expect(r.devenuesCritiques).toContain('E')
    expect(r.simule.dates.get('E')?.margeTotale).toBe(0)
  })
})

describe('une perturbation qui depasse la marge', () => {
  // E a 4 jours de marge ; un decalage de 10 jours en consomme 6 de trop.
  const r = simuler(contexte, [{ tache: 'E', decalageJ: 10 }])

  it('allonge le reseau du depassement seul', () => {
    expect(r.allongementJ).toBe(6)
    expect(r.dureeSimuleeJ).toBe(41)
  })

  it('produit un retard egal a l allongement', () => {
    expect(r.retardJ).toBe(6)
  })

  it('chiffre la penalite : 6 jours a un millieme du marche', () => {
    expect(r.penaliteXof).toBe(6_000_000)
    expect(r.penaliteSupplementaireXof).toBe(6_000_000)
  })

  it('menace les deux jalons contractuels situes en aval', () => {
    expect(r.jalonsMenaces.map((j) => j.id).sort()).toEqual(['j1', 'j2'])
  })

  it('chiffre le glissement de chaque jalon', () => {
    const reception = r.jalons.find((j) => j.id === 'j2')
    expect(reception?.jourReference).toBe(34)
    expect(reception?.jourSimule).toBe(40)
    expect(reception?.glissementJ).toBe(6)
  })

  it('rend critique la tache perturbee et libere l autre branche', () => {
    // E devient critique : elle est plaquee par la contrainte de date et
    // commande desormais la fin du reseau.
    expect(r.devenuesCritiques).toEqual(['E'])
    // B et D cessent de l etre : leur branche dispose maintenant de marge.
    expect(r.liberees).toContain('B')
    expect(r.liberees).toContain('D')
  })

  it('C gagne de la marge au lieu de devenir critique', () => {
    // Point de lecture important : le decalage est une contrainte de DATE
    // posee sur E, pas un retard propage depuis C. E ne peut plus remonter,
    // donc son predecesseur C dispose desormais de dix jours de marge la ou
    // il n en avait que quatre. Un outil qui rendrait C critique se
    // tromperait sur la nature de la contrainte.
    expect(r.reference.dates.get('C')?.margeTotale).toBe(4)
    expect(r.simule.dates.get('C')?.margeTotale).toBe(10)
    expect(r.devenuesCritiques).not.toContain('C')
  })
})

describe('perturbation sur une tache deja critique', () => {
  const r = simuler(contexte, [{ tache: 'A', decalageJ: 5 }])

  it('se repercute integralement sur la duree', () => {
    expect(r.allongementJ).toBe(5)
  })

  it('ne libere aucune tache du chemin critique', () => {
    expect(r.liberees).toEqual([])
  })
})

describe('allongement de duree plutot que decalage', () => {
  it('allonger une tache critique allonge le reseau d autant', () => {
    const r = simuler(contexte, [{ tache: 'F', allongementJ: 4 }])
    expect(r.allongementJ).toBe(4)
    expect(r.simule.dates.get('F')?.finTot).toBe(26)
  })

  it('allonger une tache a marge consomme d abord la marge', () => {
    const r = simuler(contexte, [{ tache: 'H', allongementJ: 2 }])
    expect(r.allongementJ).toBe(0)
    expect(r.simule.dates.get('H')?.margeTotale).toBe(1)
  })

  it('refuse un allongement qui annulerait la duree', () => {
    expect(() => simuler(contexte, [{ tache: 'F', allongementJ: -4 }])).toThrow()
  })

  it('un raccourcissement partiel est accepte', () => {
    const r = simuler(contexte, [{ tache: 'F', allongementJ: -2 }])
    expect(r.allongementJ).toBe(-2)
  })
})

describe('plusieurs perturbations', () => {
  it('cumule les perturbations portant sur la meme tache', () => {
    const r = simuler(contexte, [
      { tache: 'E', decalageJ: 6 },
      { tache: 'E', decalageJ: 4 },
    ])
    expect(r.allongementJ).toBe(6)
  })

  it('combine un decalage et un allongement sur des taches differentes', () => {
    const r = simuler(contexte, [
      { tache: 'A', decalageJ: 2 },
      { tache: 'J', allongementJ: 3 },
    ])
    expect(r.allongementJ).toBe(5)
  })

  it('une liste vide ne change rien', () => {
    const r = simuler(contexte, [])
    expect(r.allongementJ).toBe(0)
    expect(r.devenuesCritiques).toEqual([])
    expect(r.liberees).toEqual([])
  })
})

describe('garde-fous', () => {
  it('refuse une tache inconnue', () => {
    expect(() => simuler(contexte, [{ tache: 'FANTOME', decalageJ: 1 }])).toThrow(/Tache inconnue/)
  })

  it('n altere pas le reseau de reference', () => {
    const avant = JSON.stringify(RESEAU_REFERENCE)
    simuler(contexte, [{ tache: 'E', decalageJ: 12 }])
    expect(JSON.stringify(RESEAU_REFERENCE)).toBe(avant)
  })

  it('deux simulations successives donnent le meme resultat', () => {
    const a = simuler(contexte, [{ tache: 'C', decalageJ: 7 }])
    const b = simuler(contexte, [{ tache: 'C', decalageJ: 7 }])
    expect(a.dureeSimuleeJ).toBe(b.dureeSimuleeJ)
    expect(a.devenuesCritiques).toEqual(b.devenuesCritiques)
  })
})

describe('scenario sur le chantier reel', () => {
  const planning = calerPlanning()
  const contexteReel: ContexteSimulation = {
    reseau: {
      taches: planning.taches.map((t) => ({ id: t.code, duree: t.duree })),
      liaisons: planning.liaisons.map((l) => ({
        amont: l.amont,
        aval: l.aval,
        type: l.type,
        decalage: l.decalage,
      })),
    },
    jalons: [
      {
        id: 'go',
        nom: 'Achevement du gros oeuvre',
        tacheDeclenchante: '04.4.3',
        contractuel: true,
      },
      {
        id: 'reception',
        nom: 'Reception provisoire',
        tacheDeclenchante: '08.1.3',
        contractuel: true,
      },
    ],
    dureeContractuelleJ: planning.dureeTotale,
    montantMarcheXof: planning.budgetTotal,
    tauxPenaliteJournaliere: 0.001,
  }

  it('un glissement de dix jours sur les fondations repousse la fin du chantier', () => {
    const r = simuler(contexteReel, [{ tache: '03.1.4', decalageJ: 10 }])
    // Les longrines sont sur le chemin critique : le glissement passe entier.
    expect(r.allongementJ).toBe(10)
    expect(r.retardJ).toBe(10)
    expect(r.penaliteXof).toBe(Math.round(10 * 0.001 * planning.budgetTotal))
  })

  it('le jalon de reception glisse d autant', () => {
    const r = simuler(contexteReel, [{ tache: '03.1.4', decalageJ: 10 }])
    expect(r.jalons.find((j) => j.id === 'reception')?.glissementJ).toBe(10)
  })

  it('un glissement sur une tache a marge est absorbe', () => {
    // Le reseau reel comporte des taches non critiques : on en prend une et on
    // verifie que le glissement reste dans sa marge.
    const reference = simuler(contexteReel, [])
    const aMarge = [...reference.reference.dates.entries()]
      .filter(([, d]) => d.margeTotale >= 5)
      .map(([id]) => id)
    expect(aMarge.length).toBeGreaterThan(0)
    const r = simuler(contexteReel, [{ tache: aMarge[0] as string, decalageJ: 3 }])
    expect(r.allongementJ).toBe(0)
  })

  it('la simulation reste instantanee sur le reseau complet', () => {
    const debut = performance.now()
    for (let i = 0; i < 50; i++) simuler(contexteReel, [{ tache: '04.1.1', decalageJ: i }])
    const parSimulation = (performance.now() - debut) / 50
    // Une simulation doit rester sous la milliseconde pour permettre un
    // glisser-deposer reactif dans le diagramme de Gantt.
    expect(parSimulation).toBeLessThan(5)
  })
})
