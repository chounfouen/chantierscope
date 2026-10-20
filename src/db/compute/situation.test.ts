import { describe, expect, it } from 'vitest'
import {
  coefficientRevision,
  coefficientsDuMois,
  partRemboursee,
  situations,
  type Arrete,
} from '@/db/compute/situation'

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

  it('restitue la retenue au terme de la garantie de parfait achevement', () => {
    const s = situations(CLAUSES, [
      // Delai tenu : aucune penalite ne vient brouiller la restitution.
      { ...arrete('2027-03', 1_000_000_000), finContractuelle: '2027-04-17' },
      {
        ...arrete('2028-04', 1_000_000_000),
        date: '2027-04-17',
        finContractuelle: '2027-04-17',
        retenueRestituee: true,
      },
    ])
    expect(s[0]?.retenueGarantieXof).toBe(50_000_000)
    expect(s[1]?.retenueGarantieXof).toBe(0)
    expect(s[1]?.aPayerXof).toBe(50_000_000)
  })
})

describe('revision des prix', () => {
  it('Cn = a + (1 - a) In / I0, arrondi au millieme superieur', () => {
    expect(coefficientRevision(0.15, 103.2, 100)).toBe(1.028)
    expect(coefficientRevision(0.15, 100, 100)).toBe(1)
    // 0,15 + 0,85 x 1,0201 = 1,017085 : millieme superieur, 1,018.
    expect(coefficientRevision(0.15, 102.01, 100)).toBe(1.018)
  })

  it('remplace un index non publie par le dernier connu, et le signale', () => {
    const c = coefficientsDuMois({
      mois: ['2026-03', '2026-04', '2026-05'],
      partieFixe: 0.15,
      moisZero: '2026-01',
      indices: new Map([
        ['2026-01', 100],
        ['2026-03', 102],
        ['2026-04', 104],
      ]),
    })
    expect(c.get('2026-04')).toEqual({ coefficient: 1.034, provisoire: false })
    expect(c.get('2026-05')).toEqual({ coefficient: 1.034, provisoire: true })
  })

  it('a prix fermes, sans mois zero, le coefficient vaut un', () => {
    const c = coefficientsDuMois({
      mois: ['2026-03'],
      partieFixe: 0.15,
      moisZero: null,
      indices: new Map(),
    })
    expect(c.get('2026-03')?.coefficient).toBe(1)
  })

  it('revise les travaux de chaque mois, et la retenue porte aussi sur la revision', () => {
    const s = situations(CLAUSES, [
      { ...arrete('2026-03', 100_000_000), coefficientRevision: 1.02 },
      { ...arrete('2026-04', 300_000_000), coefficientRevision: 1.05 },
    ])
    expect(s[0]?.revisionXof).toBe(2_000_000)
    expect(s[1]?.revisionXof).toBe(2_000_000 + 10_000_000)
    expect(s[1]?.retenueGarantieXof).toBe(Math.round(0.05 * 312_000_000))
  })
})

describe('decomptes figes', () => {
  it('un decompte accepte ne bouge plus, et le mois suivant regularise l ecart', () => {
    const arretes = [arrete('2026-03', 100_000_000), arrete('2026-04', 250_000_000)]
    const libre = situations(CLAUSES, arretes)
    // Le journal de mars a ete rectifie depuis : 100 M devenus 90 M.
    const corrige = [arrete('2026-03', 90_000_000), arrete('2026-04', 250_000_000)]
    const fige = libre[0] as NonNullable<(typeof libre)[number]>
    const s = situations(
      CLAUSES,
      corrige,
      new Map([
        [
          '2026-03',
          {
            statut: 'ACCEPTEE' as const,
            travauxXof: fige.travauxXof,
            revisionXof: fige.revisionXof,
            retenueGarantieXof: fige.retenueGarantieXof,
            remboursementAvanceXof: fige.remboursementAvanceXof,
            penalitesXof: fige.penalitesXof,
            netCumuleXof: fige.netCumuleXof,
            aPayerXof: fige.aPayerXof,
          },
        ],
      ]),
    )
    expect(s[0]?.statut).toBe('ACCEPTEE')
    expect(s[0]?.travauxXof).toBe(100_000_000)
    expect(s[1]?.statut).toBe('PROJETEE')
    // Le paiement d'avril part du net accepte en mars.
    expect(s[1]?.aPayerXof).toBe((s[1]?.netCumuleXof ?? 0) - fige.netCumuleXof)
    const total = s.reduce((t, x) => t + x.aPayerXof, 0)
    expect(total).toBe(s[1]?.netCumuleXof)
  })
})
