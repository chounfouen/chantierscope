/**
 * Generateur pseudo-aleatoire a graine fixe.
 *
 * Le peuplement ne doit jamais appeler `Math.random` : deux executions de
 * `db:reset` doivent produire des donnees strictement identiques. C'est ce qui
 * rend la demonstration reproductible et les valeurs attendues des tests
 * stables.
 *
 * Algorithme mulberry32 : suffisant pour des donnees de demonstration, tient
 * en huit lignes, et sa sequence est reproductible d'une machine a l'autre.
 */

export type Hasard = {
  /** Reel dans [0, 1[. */
  reel: () => number
  /** Entier dans [min, max], bornes incluses. */
  entier: (min: number, max: number) => number
  /** Reel dans [min, max[. */
  entre: (min: number, max: number) => number
  /** Vrai avec la probabilite donnee. */
  chance: (probabilite: number) => boolean
  /** Un element du tableau, jamais indefini tant que le tableau est non vide. */
  choix: <T>(elements: readonly T[]) => T
  /**
   * Bruit gaussien centre reduit, par la transformee de Box-Muller.
   * Les rendements de chantier se distribuent autour d'une moyenne ; un tirage
   * uniforme produirait des variations trop plates pour etre credibles.
   */
  gaussien: () => number
}

export function hasard(graine: number): Hasard {
  let etat = graine >>> 0

  const reel = (): number => {
    etat = (etat + 0x6d2b79f5) >>> 0
    let t = etat
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const entre = (min: number, max: number): number => min + reel() * (max - min)

  const entier = (min: number, max: number): number => Math.floor(entre(min, max + 1))

  const chance = (probabilite: number): boolean => reel() < probabilite

  const choix = <T>(elements: readonly T[]): T => {
    if (elements.length === 0) throw new Error('Tirage dans un tableau vide')
    // Le typage strict ne peut pas savoir que l'indice est valide ; la garde
    // ci-dessus le garantit.
    return elements[entier(0, elements.length - 1)] as T
  }

  const gaussien = (): number => {
    const u = 1 - reel()
    const v = reel()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  return { reel, entier, entre, chance, choix, gaussien }
}

/** Graine unique du peuplement. La changer change tout le jeu de donnees. */
export const GRAINE = 20260302
