import { describe, expect, it } from 'vitest'
import { palierAtteint, serieDeReleves } from '@/db/compute/serie'

// Le jeudi 1er octobre 2026 ; le dimanche 27 septembre ne se travaille pas.
describe('serie de releves', () => {
  it('compte les journees consecutives, en sautant le dimanche', () => {
    const dates = ['2026-10-01', '2026-09-30', '2026-09-29', '2026-09-28', '2026-09-26']
    expect(serieDeReleves(dates, '2026-10-01')).toBe(5)
  })

  it('ne casse pas la serie pour la journee en cours, pas encore saisie', () => {
    expect(serieDeReleves(['2026-09-30', '2026-09-29'], '2026-10-01')).toBe(2)
  })

  it('s arrete au premier jour ouvrable manque', () => {
    expect(serieDeReleves(['2026-10-01', '2026-09-29'], '2026-10-01')).toBe(1)
  })

  it('vaut zero sans releve recent', () => {
    expect(serieDeReleves([], '2026-10-01')).toBe(0)
    expect(serieDeReleves(['2026-09-01'], '2026-10-01')).toBe(0)
  })

  it('ignore les doublons de plusieurs lots le meme jour', () => {
    expect(serieDeReleves(['2026-10-01', '2026-10-01', '2026-09-30'], '2026-10-01')).toBe(2)
  })

  it('ne felicite que les paliers', () => {
    expect([4, 5, 10, 20, 30, 31, 50, 75].map(palierAtteint)).toEqual([
      null,
      5,
      10,
      20,
      30,
      null,
      50,
      75,
    ])
  })
})
