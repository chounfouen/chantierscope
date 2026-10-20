import { describe, expect, it } from 'vitest'
import { indicateursSecurite, situationSousTraitant } from '@/db/compute/securite'

describe('indicateurs de securite', () => {
  const evenements = [
    { date: '2026-04-10', type: 'ACCIDENT_AVEC_ARRET' as const, joursArret: 4 },
    { date: '2026-05-02', type: 'ACCIDENT_SANS_ARRET' as const, joursArret: 0 },
    { date: '2026-05-20', type: 'PRESQU_ACCIDENT' as const, joursArret: 0 },
    { date: '2026-06-01', type: 'CAUSERIE' as const, joursArret: 0 },
    { date: '2026-07-01', type: 'ACCIDENT_AVEC_ARRET' as const, joursArret: 6 },
  ]

  it('rapporte accidents et jours d arret aux heures travaillees', () => {
    const i = indicateursSecurite({
      evenements,
      heures: 200_000,
      origine: '2026-03-02',
      aujourdhui: '2026-07-31',
    })
    expect(i.accidentsAvecArret).toBe(2)
    expect(i.tauxFrequence).toBe(10)
    expect(i.joursArret).toBe(10)
    expect(i.tauxGravite).toBe(0.05)
    expect(i.signaux).toBe(1)
    expect(i.accidentsSansArret).toBe(1)
    expect(i.joursSansAccident).toBe(30)
  })

  it('ignore les evenements posterieurs et compte depuis l origine sans accident', () => {
    const i = indicateursSecurite({
      evenements,
      heures: 0,
      origine: '2026-03-02',
      aujourdhui: '2026-04-01',
    })
    expect(i.accidentsAvecArret).toBe(0)
    expect(i.tauxFrequence).toBeNull()
    expect(i.joursSansAccident).toBe(30)
  })
})

describe('situation d un sous-traitant', () => {
  it('suit l avancement de ses lots, pondere par leur budget', () => {
    const s = situationSousTraitant({
      montantXof: 100_000_000,
      lots: [
        { budgetXof: 300, valeurAcquiseXof: 150 },
        { budgetXof: 100, valeurAcquiseXof: 100 },
      ],
    })
    expect(s.avancement).toBeCloseTo(0.625, 12)
    expect(s.travauxXof).toBe(62_500_000)
  })
})
