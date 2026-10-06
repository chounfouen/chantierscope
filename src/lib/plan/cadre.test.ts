import { describe, expect, it } from 'vitest'
import { cadreComplet, deplacer, niveauZoom, zoomer, ZOOM_MAX } from '@/lib/plan/cadre'

const g = { largeur: 1000, hauteur: 500 }

describe('cadre du plan', () => {
  it('zoome autour du point vise, qui reste en place', () => {
    const c = zoomer(cadreComplet(g), 2, [250, 125], g)
    expect(c).toEqual({ x: 125, y: 62.5, l: 500, h: 250 })
    expect(niveauZoom(c, g)).toBe(2)
  })

  it('ne zoome ni au-dela du maximum, ni en deca du plan entier', () => {
    expect(niveauZoom(zoomer(cadreComplet(g), 100, [500, 250], g), g)).toBe(ZOOM_MAX)
    expect(zoomer(cadreComplet(g), 0.5, [500, 250], g)).toEqual(cadreComplet(g))
  })

  it('ne sort pas du plan en se deplacant', () => {
    const c = zoomer(cadreComplet(g), 2, [0, 0], g)
    expect(deplacer(c, -300, -300, g)).toMatchObject({ x: 0, y: 0 })
    expect(deplacer(c, 9000, 9000, g)).toMatchObject({ x: 500, y: 250 })
  })
})
