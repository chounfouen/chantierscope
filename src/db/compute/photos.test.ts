import { describe, expect, it } from 'vitest'
import {
  datesDePrise,
  filtrer,
  joursEntre,
  parDate,
  parPointDeVue,
  photoA,
  type PhotoTimeline,
} from '@/db/compute/photos'

const p = (
  id: string,
  date: string,
  pointDeVueId: string | null,
  lotId: string | null = null,
): PhotoTimeline => ({
  id,
  date,
  pointDeVueId,
  lotId,
  legende: null,
})

const PHOTOS = [
  p('c', '2026-05-01', 'nord'),
  p('a', '2026-03-01', 'nord', 'go'),
  p('b', '2026-04-01', 'est'),
  p('d', '2026-04-01', 'nord'),
  p('e', '2026-04-15', null),
]

describe('regroupements', () => {
  it('regroupe par point de vue dans l ordre donne, en ordre chronologique, les orphelines a la fin', () => {
    const g = parPointDeVue(PHOTOS, ['est', 'nord'])
    expect(g.map((x) => x.pointDeVueId)).toEqual(['est', 'nord', null])
    expect(g[1]?.photos.map((x) => x.id)).toEqual(['a', 'd', 'c'])
  })

  it('regroupe par date, la plus recente en tete', () => {
    expect(parDate(PHOTOS).map((x) => [x.date, x.photos.map((y) => y.id)])).toEqual([
      ['2026-05-01', ['c']],
      ['2026-04-15', ['e']],
      ['2026-04-01', ['b', 'd']],
      ['2026-03-01', ['a']],
    ])
  })

  it('donne les crans du curseur sans doublon', () => {
    expect(datesDePrise(PHOTOS)).toEqual(['2026-03-01', '2026-04-01', '2026-04-15', '2026-05-01'])
  })
})

describe('curseur temporel', () => {
  const nord = parPointDeVue(PHOTOS, ['nord'])[0]!.photos

  it('montre la derniere prise a la date ou avant', () => {
    expect(photoA(nord, '2026-04-01')?.id).toBe('d')
    expect(photoA(nord, '2026-04-20')?.id).toBe('d')
    expect(photoA(nord, '2030-01-01')?.id).toBe('c')
  })

  it('ne montre rien avant la premiere prise', () => {
    expect(photoA(nord, '2026-02-28')).toBeNull()
  })
})

describe('filtres', () => {
  it('combine point de vue, lot et periode, bornes incluses', () => {
    expect(filtrer(PHOTOS, { pointDeVueId: 'nord' }).map((x) => x.id)).toEqual(['c', 'a', 'd'])
    expect(filtrer(PHOTOS, { lotId: 'go' }).map((x) => x.id)).toEqual(['a'])
    expect(filtrer(PHOTOS, { du: '2026-04-01', au: '2026-04-15' }).map((x) => x.id)).toEqual([
      'b',
      'd',
      'e',
    ])
    expect(filtrer(PHOTOS, {})).toHaveLength(5)
  })

  it('compte les jours entre deux prises', () => {
    expect(joursEntre('2026-03-01', '2026-05-01')).toBe(61)
  })
})
