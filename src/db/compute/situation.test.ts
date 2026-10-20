import { describe, expect, it } from 'vitest'
import { partRemboursee, situations, type Arrete } from '@/db/compute/situation'

const CLAUSES = {
  retenueGarantieTaux: 0.05,
  avanceTaux: 0.15,
  remboursementDebut: 0.65,
  remboursementFin: 0.8,
  montantInitialXof: 1_000_000_000,
  tauxPenaliteJournaliere: 0.001,
  plafondPenalite: 0.1,
}

const arrete = (mois: string, travauxXof: number, provisoire = false): Arrete => ({
  mois,
  date: `${mois}-28`,
  travauxXof,
  montantMarcheXof: 1_000_000_000,
  finContractuelle: '2027-04-17',
  provisoire,
})

describe('remboursement de l avance', () => {
  it('ne commence qu au premier seuil et s acheve au second', () => {
    expect(partRemboursee(0.5, 0.65, 0.8)).toBe(0)
    expect(partRemboursee(0.725, 0.65, 0.8)).toBeCloseTo(0.5, 12)
    expect(partRemboursee(0.9, 0.65, 0.8)).toBe(1)
  })
})

describe('situations mensuelles', () => {
  it('decompte en cumul et paie la difference des nets', () => {
    const s = situations(CLAUSES, [arrete('2026-03', 100_000_000), arrete('2026-04', 250_000_000)])
    expect(s[0]).toMatchObject({
      numero: 1,
      travauxXof: 100_000_000,
      retenueGarantieXof: 5_000_000,
      remboursementAvanceXof: 0,
      penalitesXof: 0,
      netCumuleXof: 95_000_000,
      aPayerXof: 95_000_000,
    })
    expect(s[1]?.netCumuleXof).toBe(237_500_000)
    expect(s[1]?.aPayerXof).toBe(142_500_000)
  })

  it('rembourse l avance entre 65 et 80 % d execution', () => {
    const s = situations(CLAUSES, [
      arrete('2026-09', 600_000_000),
      arrete('2026-10', 725_000_000),
      arrete('2026-11', 850_000_000),
    ])
    expect(s.map((x) => x.remboursementAvanceXof)).toEqual([0, 75_000_000, 150_000_000])
    // Le mois ou l'avance se rembourse, le paiement est ampute d'autant.
    expect(s[1]?.aPayerXof).toBe(125_000_000 * 0.95 - 75_000_000)
  })

  it('la somme des paiements mensuels redonne le net cumule, sans derive d arrondi', () => {
    const montants = [123_456_789.4, 287_654_321.6, 401_010_101.5, 699_999_999.5, 812_345_678.9]
    const s = situations(
      CLAUSES,
      montants.map((m, i) => arrete(`2026-0${i + 3}`, m)),
    )
    const total = s.reduce((t, x) => t + x.aPayerXof, 0)
    expect(total).toBe(s.at(-1)?.netCumuleXof)
    for (const x of s) expect(Number.isInteger(x.aPayerXof)).toBe(true)
  })

  it('ne retient de penalite qu une fois le delai echu, plafonnee', () => {
    const s = situations(CLAUSES, [
      { ...arrete('2027-04', 950_000_000), date: '2027-04-17' },
      { ...arrete('2027-05', 980_000_000), date: '2027-05-07' },
      { ...arrete('2027-09', 1_000_000_000), date: '2027-09-30' },
    ])
    expect(s[0]?.retardConstateJ).toBe(0)
    expect(s[0]?.penalitesXof).toBe(0)
    expect(s[1]?.retardConstateJ).toBe(20)
    expect(s[1]?.penalitesXof).toBe(20_000_000)
    expect(s[2]?.penalitesXof).toBe(100_000_000)
  })

  it('un mois sans avancement peut appeler un paiement negatif quand une retenue s ajoute', () => {
    const s = situations(CLAUSES, [
      { ...arrete('2027-04', 950_000_000), date: '2027-04-17' },
      { ...arrete('2027-05', 950_000_000), date: '2027-05-07' },
    ])
    expect(s[1]?.aPayerXof).toBe(-20_000_000)
  })
})
