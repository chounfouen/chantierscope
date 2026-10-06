/**
 * Geometrie des zones du plan : un polygone par zone, stocke comme chemin SVG
 * `M x y L x y ... Z` dans le repere de l'image du niveau.
 *
 * Sans plan importe, un niveau garde le gabarit historique de 440 sur 280.
 * Quand un plan est importe, les zones deja dessinees sont remises a
 * l'echelle de la nouvelle image plutot que perdues : leur position relative
 * est conservee, il ne reste qu'a les ajuster.
 */

export type Point = [number, number]
export type Gabarit = { largeur: number; hauteur: number }

/** Repere des niveaux sans plan importe. */
export const GABARIT_SANS_PLAN: Gabarit = { largeur: 440, hauteur: 280 }

/** Un contour se trace a la main : au-dela, c'est une erreur de saisie. */
export const SOMMETS_MAX = 200

const arrondi = (v: number) => Math.round(v * 10) / 10

/** Sommets d'un chemin de zone. Seules les commandes M, L et Z absolues sont admises. */
export function lirePolygone(chemin: string): Point[] {
  const jetons = chemin.trim().match(/[MLZ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) ?? []
  const reste = chemin.replace(/[MLZ]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?|[\s,]/gi, '')
  if (reste !== '') throw new Error(`Contour de zone non pris en charge : ${chemin.slice(0, 40)}`)
  const points: Point[] = []
  let attente: number | null = null
  for (const j of jetons) {
    if (/^[MLZ]$/i.test(j)) {
      if (j.toUpperCase() !== j) throw new Error('Commandes relatives non prises en charge.')
      continue
    }
    const v = Number(j)
    if (attente === null) attente = v
    else {
      points.push([attente, v])
      attente = null
    }
  }
  return points
}

export function cheminPolygone(points: readonly Point[]): string {
  return `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${arrondi(x)} ${arrondi(y)}`).join(' ')} Z`
}

/** Aire signee (formule du lacet). */
export function aire(points: readonly Point[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i] as Point
    const [x2, y2] = points[(i + 1) % points.length] as Point
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

/**
 * Point d'ancrage de l'etiquette : barycentre de la surface, qui reste dans
 * un rectangle ou un L ; moyenne des sommets pour un contour degenere.
 */
export function centre(chemin: string): Point {
  const p = lirePolygone(chemin)
  if (p.length === 0) return [0, 0]
  const a = aire(p)
  if (Math.abs(a) < 1e-9) {
    const n = p.length
    return [p.reduce((s, q) => s + q[0], 0) / n, p.reduce((s, q) => s + q[1], 0) / n]
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i] as Point
    const [x2, y2] = p[(i + 1) % p.length] as Point
    const f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f
    cy += (y1 + y2) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

/**
 * Remise a l'echelle d'un contour d'un gabarit a un autre. Chaque sommet
 * garde sa position RELATIVE dans le plan : a 30 % de la largeur et 60 % de
 * la hauteur avant, il y reste apres. La transformation est ainsi exactement
 * reversible : importer un plan puis le retirer rend les contours d'origine,
 * sans derive au fil des remplacements. Si les proportions du nouveau plan
 * different, les zones s'etirent : elles restent a ajuster, mais a leur place.
 */
export function remettreAEchelle(chemin: string, de: Gabarit, vers: Gabarit): string {
  const kx = vers.largeur / de.largeur
  const ky = vers.hauteur / de.hauteur
  return cheminPolygone(lirePolygone(chemin).map(([x, y]) => [x * kx, y * ky]))
}

/** Motif de refus d'un contour, ou null s'il est acceptable. */
export function refusPolygone(points: readonly Point[], g: Gabarit): string | null {
  if (points.length < 3) return 'Une zone a au moins trois sommets.'
  if (points.length > SOMMETS_MAX) return `Une zone a au plus ${SOMMETS_MAX} sommets.`
  const dehors = points.some(
    ([x, y]) =>
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      y < 0 ||
      x > g.largeur ||
      y > g.hauteur,
  )
  if (dehors) return 'La zone déborde du plan.'
  // Une zone plus petite qu'un dix-millieme du plan est un clic involontaire.
  if (Math.abs(aire(points)) < (g.largeur * g.hauteur) / 10_000) return 'La zone est trop petite.'
  return null
}

/** Libelle d'un niveau : rez-de-chaussee, etages R+n, sous-sols. */
export function libelleNiveau(n: number): string {
  if (n === 0) return 'Rez-de-chaussée'
  return n > 0 ? `R+${n}` : `Sous-sol ${-n}`
}
