/**
 * Acces a la palette de visualisation.
 *
 * Les huit teintes categorielles sont attribuees dans un ordre FIXE et ne sont
 * jamais cyclees. La couleur suit l'entite, jamais son rang : un filtre qui
 * reduit le nombre de lots affiches ne repeint pas les lots restants. C'est
 * pourquoi l'indice de teinte d'un lot est stocke en base dans
 * `lot.rang_couleur` et ne depend jamais de l'ordre d'affichage.
 *
 * Contrainte de relief heritee de la validation : en mode clair, les teintes 3,
 * 4 et 5 passent sous 3:1 face a la surface. Tout graphique qui les emploie
 * porte des etiquettes directes visibles ou offre la vue tableau.
 */

/** Les huit emplacements categoriels, dans l'ordre valide. */
export const SERIES = [
  'var(--serie-1)',
  'var(--serie-2)',
  'var(--serie-3)',
  'var(--serie-4)',
  'var(--serie-5)',
  'var(--serie-6)',
  'var(--serie-7)',
  'var(--serie-8)',
] as const

export const NOMBRE_SERIES = SERIES.length

/**
 * Teinte d'une entite d'apres son rang stocke.
 *
 * Au-dela de huit entites, la neuvieme n'obtient pas une teinte generee : elle
 * est repliee dans un groupe « Autres ». Cette fonction leve, pour que le cas
 * soit traite en amont plutot que silencieusement mal colore.
 */
export function teinteSerie(rang: number): string {
  const teinte = SERIES[rang]
  if (teinte === undefined) {
    throw new Error(
      `Rang de couleur ${rang} hors de la palette (0 a ${NOMBRE_SERIES - 1}). ` +
        'Au-delà de huit entités, replier dans un groupe « Autres » ou facetter.',
    )
  }
  return teinte
}

/**
 * Les trois series de la courbe en S. Ce sont les trois premiers emplacements,
 * les seuls qui valident en mode toutes-paires, dans les deux themes.
 */
export const COURBE_S = {
  valeurPlanifiee: { couleur: 'var(--serie-1)', libelle: 'Valeur planifiée' },
  valeurAcquise: { couleur: 'var(--serie-2)', libelle: 'Valeur acquise' },
  coutReel: { couleur: 'var(--serie-3)', libelle: 'Coût réel' },
} as const

/** Encre et chrome, pour les axes, la grille et les etiquettes d'un graphique. */
export const CHROME = {
  encrePrimaire: 'var(--encre-primaire)',
  encreSecondaire: 'var(--encre-secondaire)',
  encreDiscrete: 'var(--encre-discrete)',
  grille: 'var(--grille)',
  ligneBase: 'var(--ligne-base)',
} as const

/** Epaisseurs de trait et tailles de marque, uniformes dans tous les graphiques. */
export const MARQUE = {
  /** Epaisseur d'une courbe. */
  trait: 2,
  /** Rayon minimal d'un point, pour que la cible de survol reste atteignable. */
  point: 4,
  /** Arrondi de l'extremite d'une barre. */
  arrondi: 4,
  /** Ecart de surface entre deux remplissages adjacents ou empiles. */
  ecart: 2,
  /** Epaisseur de la grille et des axes. */
  hairline: 1,
} as const

/** Tirets de la projection, au-dela de la date du jour. */
export const TIRETS_PROJECTION = '4 4'

/**
 * Encres du fond de plan importe. Ce dessin est converti en image avant
 * depot : une image ne lit pas les variables CSS, d'ou des valeurs fixes.
 * Trait sombre sur fond blanc, comme un tirage ; le theme sombre inverse
 * l'image a l'affichage plutot que d'en stocker une seconde.
 */
export const FOND_DE_PLAN = {
  fond: '#ffffff',
  trait: '#2f3542',
  texte: '#4a5160',
  /** Epaisseur du trait, en pixels de l'image. */
  epaisseur: 1.6,
} as const
