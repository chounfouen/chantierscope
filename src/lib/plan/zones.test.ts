import { describe, expect, it } from 'vitest'
import {
  aire,
  centre,
  cheminPolygone,
  libelleNiveau,
  lirePolygone,
  refusPolygone,
  remettreAEchelle,
} from '@/lib/plan/zones'

describe('contours de zone', () => {
  it('lit et reecrit un contour du jeu de demonstration', () => {
    const c = 'M 40 40 L 200 40 L 200 140 L 40 140 Z'
    expect(lirePolygone(c)).toEqual([
      [40, 40],
      [200, 40],
      [200, 140],
      [40, 140],
    ])
    expect(cheminPolygone(lirePolygone(c))).toBe(c)
  })

  it('refuse les commandes qu il ne sait pas relire', () => {
    expect(() => lirePolygone('M 0 0 C 1 1 2 2 3 3 Z')).toThrow()
    expect(() => lirePolygone('m 0 0 l 10 0 l 0 10 z')).toThrow(/relatives/)
  })

  it('ancre l etiquette au barycentre, meme dans un L', () => {
    expect(centre('M 0 0 L 10 0 L 10 10 L 0 10 Z')).toEqual([5, 5])
    const [x, y] = centre('M 0 0 L 30 0 L 30 10 L 10 10 L 10 30 L 0 30 Z')
    expect(x).toBeCloseTo(11, 0)
    expect(y).toBeCloseTo(11, 0)
  })

  it('remet a l echelle d une nouvelle image, de facon reversible', () => {
    // 440 x 280 vers 2200 x 1400 : facteur 5 sur les deux axes.
    expect(
      remettreAEchelle(
        'M 0 0 L 440 0 L 440 280 Z',
        { largeur: 440, hauteur: 280 },
        { largeur: 2200, hauteur: 1400 },
      ),
    ).toBe('M 0 0 L 2200 0 L 2200 1400 Z')
    const c = 'M 40 40 L 200 40 L 200 140 L 40 140 Z'
    const a = { largeur: 440, hauteur: 280 }
    const b = { largeur: 3121, hauteur: 2207 }
    expect(remettreAEchelle(remettreAEchelle(c, a, b), b, a)).toBe(c)
  })

  it('refuse un contour degenere, debordant ou minuscule', () => {
    const g = { largeur: 100, hauteur: 100 }
    expect(
      refusPolygone(
        [
          [0, 0],
          [10, 0],
        ],
        g,
      ),
    ).toMatch(/trois sommets/)
    expect(
      refusPolygone(
        [
          [0, 0],
          [120, 0],
          [0, 10],
        ],
        g,
      ),
    ).toMatch(/déborde/)
    expect(
      refusPolygone(
        [
          [0, 0],
          [0.5, 0],
          [0, 0.5],
        ],
        g,
      ),
    ).toMatch(/trop petite/)
    expect(
      refusPolygone(
        [
          [0, 0],
          [50, 0],
          [50, 50],
        ],
        g,
      ),
    ).toBeNull()
    expect(
      Math.abs(
        aire([
          [0, 0],
          [50, 0],
          [50, 50],
        ]),
      ),
    ).toBe(1250)
  })

  it('nomme les niveaux', () => {
    expect([-2, 0, 3].map(libelleNiveau)).toEqual(['Sous-sol 2', 'Rez-de-chaussée', 'R+3'])
  })
})
