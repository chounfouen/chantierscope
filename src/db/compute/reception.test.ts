import { describe, expect, it } from 'vitest'
import { finGarantie, retenueRestituable, syntheseReserves } from '@/db/compute/reception'

describe('garantie de parfait achevement', () => {
  it('dure un an a compter de la reception', () => {
    expect(finGarantie('2027-04-21')).toBe('2028-04-21')
    expect(finGarantie('2028-02-29')).toBe('2029-02-28')
  })

  it('la retenue se restitue au terme, toutes reserves levees', () => {
    const base = { dateReception: '2027-04-21', reservesOuvertes: 0, aujourdhui: '2028-04-21' }
    expect(retenueRestituable(base)).toBe(true)
    expect(retenueRestituable({ ...base, reservesOuvertes: 1 })).toBe(false)
    expect(retenueRestituable({ ...base, aujourdhui: '2028-04-20' })).toBe(false)
    expect(retenueRestituable({ ...base, dateReception: null })).toBe(false)
  })
})

describe('synthese des reserves', () => {
  it('compte les ouvertes, les levees, les retards et le delai moyen', () => {
    const s = syntheseReserves(
      [
        { constateeLe: '2026-09-01', echeance: '2026-09-15', leveeLe: '2026-09-11' },
        { constateeLe: '2026-09-01', echeance: '2026-09-15', leveeLe: null },
        { constateeLe: '2026-09-10', echeance: '2026-10-30', leveeLe: null },
        { constateeLe: '2026-09-05', echeance: null, leveeLe: '2026-09-25' },
      ],
      '2026-10-01',
    )
    expect(s).toEqual({ total: 4, ouvertes: 2, levees: 2, enRetard: 1, delaiMoyenLeveeJ: 15 })
  })
})
