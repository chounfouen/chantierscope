/**
 * Cadre visible du plan : zoom et deplacement, en coordonnees du plan.
 *
 * Le cadre garde les proportions du plan, ne descend pas sous un douzieme de
 * sa largeur (au-dela, un pixel de l'image remplit l'ecran) et ne sort pas
 * du plan : on ne se perd pas dans le vide.
 */

import type { Gabarit, Point } from '@/lib/plan/zones'

export type Cadre = { x: number; y: number; l: number; h: number }

export const ZOOM_MAX = 12

export const cadreComplet = (g: Gabarit): Cadre => ({ x: 0, y: 0, l: g.largeur, h: g.hauteur })

function borner(c: Cadre, g: Gabarit): Cadre {
  const l = Math.min(g.largeur, Math.max(g.largeur / ZOOM_MAX, c.l))
  const h = (l * g.hauteur) / g.largeur
  return {
    l,
    h,
    x: Math.min(g.largeur - l, Math.max(0, c.x)),
    y: Math.min(g.hauteur - h, Math.max(0, c.y)),
  }
}

/** Zoom d'un facteur (plus grand que 1 : on s'approche), autour d'un point fixe. */
export function zoomer(c: Cadre, facteur: number, [px, py]: Point, g: Gabarit): Cadre {
  const l = c.l / facteur
  const k = l / c.l
  return borner({ x: px - (px - c.x) * k, y: py - (py - c.y) * k, l, h: c.h * k }, g)
}

export function deplacer(c: Cadre, dx: number, dy: number, g: Gabarit): Cadre {
  return borner({ ...c, x: c.x + dx, y: c.y + dy }, g)
}

export const niveauZoom = (c: Cadre, g: Gabarit) => g.largeur / c.l
