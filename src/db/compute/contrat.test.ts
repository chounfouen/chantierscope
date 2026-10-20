import { describe, expect, it } from 'vitest'
import { cadreContractuel } from '@/db/compute/contrat'

const BASE = {
  origine: '2026-03-02',
  dureeInitialeJ: 412,
  montantInitialXof: 1_000_000_000,
  intemperiesPrevisiblesJ: 6,
  avenants: [],
  ordres: [],
  intemperies: [],
  aujourdhui: '2026-10-20',
}

describe('cadre contractuel en vigueur', () => {
  it('sans acte ni intemperie, le marche initial s applique', () => {
    const c = cadreContractuel(BASE)
    expect(c.dureeJ).toBe(412)
    expect(c.finContractuelle).toBe('2027-04-17')
    expect(c.montantXof).toBe(1_000_000_000)
  })

  it('un avenant ajoute son montant et son delai', () => {
    const c = cadreContractuel({
      ...BASE,
      avenants: [
        { numero: 1, date: '2026-07-01', objet: 'Clôture', montantXof: 25_000_000, delaiJ: 10 },
      ],
    })
    expect(c.montantXof).toBe(1_025_000_000)
    expect(c.dureeJ).toBe(422)
    expect(c.finContractuelle).toBe('2027-04-27')
  })

  it('une suspension court de l ordre d arret a l ordre de reprise', () => {
    const c = cadreContractuel({
      ...BASE,
      ordres: [
        { numero: 2, date: '2026-05-10', type: 'ARRET', objet: 'Arrêt', delaiJ: 0 },
        { numero: 3, date: '2026-05-24', type: 'REPRISE', objet: 'Reprise', delaiJ: 0 },
        { numero: 4, date: '2026-06-01', type: 'PROLONGATION', objet: 'Prolongation', delaiJ: 5 },
      ],
    })
    expect(c.prolongations.suspensionsJ).toBe(14)
    expect(c.prolongations.ordresServiceJ).toBe(5)
    expect(c.dureeJ).toBe(431)
    expect(c.suspensionEnCours).toBe(false)
  })

  it('une suspension encore ouverte court jusqu a aujourd hui', () => {
    const c = cadreContractuel({
      ...BASE,
      ordres: [{ numero: 2, date: '2026-10-10', type: 'ARRET', objet: 'Arrêt', delaiJ: 0 }],
    })
    expect(c.prolongations.suspensionsJ).toBe(10)
    expect(c.suspensionEnCours).toBe(true)
  })

  it('seules les intemperies reconnues au-dela des previsibles prolongent le delai', () => {
    const c = cadreContractuel({
      ...BASE,
      intemperies: [
        { date: '2026-06-15', jours: 6, decision: 'RECONNUE' },
        { date: '2026-06-29', jours: 3, decision: 'RECONNUE' },
        { date: '2026-07-02', jours: 1, decision: 'PROPOSEE' },
        { date: '2026-07-03', jours: 1, decision: 'REJETEE' },
      ],
    })
    expect(c.intemperies).toEqual({ reconnuesJ: 9, previsiblesJ: 6, proposeesJ: 1 })
    expect(c.prolongations.intemperiesJ).toBe(3)
    expect(c.dureeJ).toBe(415)
  })

  it('des intemperies sous le seuil previsible ne prolongent rien', () => {
    const c = cadreContractuel({
      ...BASE,
      intemperies: [{ date: '2026-06-15', jours: 4, decision: 'RECONNUE' }],
    })
    expect(c.prolongations.intemperiesJ).toBe(0)
    expect(c.dureeJ).toBe(412)
  })

  it('ignore les actes et les intemperies posterieurs a la date de lecture', () => {
    const c = cadreContractuel({
      ...BASE,
      aujourdhui: '2026-06-30',
      avenants: [
        { numero: 1, date: '2026-09-01', objet: 'Clôture', montantXof: 25_000_000, delaiJ: 10 },
      ],
      ordres: [{ numero: 2, date: '2026-07-10', type: 'ARRET', objet: 'Arrêt', delaiJ: 0 }],
      intemperies: [
        { date: '2026-06-15', jours: 7, decision: 'RECONNUE' },
        { date: '2026-07-02', jours: 3, decision: 'RECONNUE' },
      ],
    })
    expect(c.montantXof).toBe(1_000_000_000)
    expect(c.prolongations).toEqual({
      avenantsJ: 0,
      ordresServiceJ: 0,
      suspensionsJ: 0,
      intemperiesJ: 1,
    })
    expect(c.suspensionEnCours).toBe(false)
  })
})
