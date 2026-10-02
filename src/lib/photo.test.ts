import { describe, expect, it } from 'vitest'
import { ConfirmationPhoto, dimensionsCibles } from '@/lib/photo'

describe('dimensions apres reduction', () => {
  it('ramene le grand cote a la cible en gardant les proportions', () => {
    expect(dimensionsCibles(4032, 3024, 1600)).toEqual({ largeur: 1600, hauteur: 1200 })
    expect(dimensionsCibles(3024, 4032, 1600)).toEqual({ largeur: 1200, hauteur: 1600 })
  })

  it('n agrandit jamais une image deja petite', () => {
    expect(dimensionsCibles(800, 600, 1600)).toEqual({ largeur: 800, hauteur: 600 })
  })

  it('garde au moins un pixel sur un panorama extreme', () => {
    expect(dimensionsCibles(20000, 5, 400)).toEqual({ largeur: 400, hauteur: 1 })
  })
})

describe('confirmation d une photo', () => {
  const ok = {
    releveId: '0f0e0d0c-0b0a-4908-8706-050403020100',
    largeur: 1600,
    hauteur: 1200,
    priseLe: '2026-10-01T09:30:00+00:00',
    legende: null,
  }

  it('accepte une photo conforme', () => {
    expect(ConfirmationPhoto.safeParse(ok).success).toBe(true)
  })

  it('refuse une photo plus grande que la cible : elle n a pas ete compressee', () => {
    expect(ConfirmationPhoto.safeParse({ ...ok, largeur: 4032 }).success).toBe(false)
  })

  it('exige un instant horodate avec son fuseau', () => {
    expect(ConfirmationPhoto.safeParse({ ...ok, priseLe: '2026-10-01' }).success).toBe(false)
  })
})
