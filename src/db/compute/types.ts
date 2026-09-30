/**
 * Types du noyau de calcul.
 *
 * Volontairement independants du schema de base : le noyau ne connait ni
 * Drizzle, ni PostgreSQL. Il prend des structures simples et rend des
 * structures simples. C'est ce qui le rend testable sans base de donnees, et
 * reutilisable pour une simulation qui n'ecrit rien.
 */

import type { MethodeAvancement, TypeLiaison } from '@/db/schema'

/* -------------------------------------------------------------------------- */
/* Reseau de taches                                                           */
/* -------------------------------------------------------------------------- */

export type TacheReseau = {
  id: string
  /** Duree en jours calendaires, strictement positive. */
  duree: number
  /**
   * Contrainte de debut au plus tot, en jours depuis l'origine du reseau.
   * Sert aux taches qui ne peuvent pas demarrer avant une date donnee, et a
   * la simulation d'alea, qui repousse une tache sans toucher au reseau.
   */
  debutImpose?: number
}

export type LiaisonReseau = {
  amont: string
  aval: string
  type: TypeLiaison
  /** Decalage en jours. Peut etre negatif : recouvrement. */
  decalage: number
}

export type Reseau = {
  taches: readonly TacheReseau[]
  liaisons: readonly LiaisonReseau[]
}

/* -------------------------------------------------------------------------- */
/* Resultat du calcul de reseau                                               */
/* -------------------------------------------------------------------------- */

/**
 * Dates d'une tache, en jours depuis l'origine du reseau, bornes INCLUSES.
 *
 * Convention retenue : une tache de duree 5 demarrant au jour 0 occupe les
 * jours 0 a 4. `finTot = debutTot + duree - 1`. Cette convention est celle du
 * planning de chantier, ou l'on compte des journees de travail et non des
 * instants. Elle impose d'ajouter 1 dans les liaisons fin-debut, ce qui est
 * la seule subtilite de tout le module.
 */
export type DatesTache = {
  debutTot: number
  finTot: number
  debutTard: number
  finTard: number
  /** Retard admissible sans repousser la fin du projet. */
  margeTotale: number
  /** Retard admissible sans repousser le debut d'aucun successeur. */
  margeLibre: number
  /** Marge totale nulle. */
  critique: boolean
}

export type ResultatReseau = {
  dates: Map<string, DatesTache>
  /** Duree totale du reseau, en jours calendaires. */
  dureeTotale: number
  /** Identifiants des taches critiques, dans l'ordre chronologique. */
  cheminCritique: string[]
}

/** Levee quand le reseau contient un circuit : le calcul est alors impossible. */
export class ErreurCycle extends Error {
  readonly taches: string[]
  constructor(taches: string[]) {
    super(
      `Le reseau contient un circuit. Taches impliquees : ${taches.join(', ')}. ` +
        'Supprimer une liaison pour rompre la boucle.',
    )
    this.name = 'ErreurCycle'
    this.taches = taches
  }
}

/** Levee quand une liaison designe une tache absente du reseau. */
export class ErreurTacheInconnue extends Error {
  constructor(id: string) {
    super(`Liaison vers une tache absente du reseau : ${id}.`)
    this.name = 'ErreurTacheInconnue'
  }
}

/* -------------------------------------------------------------------------- */
/* Avancement                                                                 */
/* -------------------------------------------------------------------------- */

export type LigneAvancement = {
  /** Quantite prevue au marche, strictement positive. */
  quantitePrevue: number
  /** Cumul realise a la date d'analyse. */
  quantiteRealisee: number
  /** Prix unitaire en entiers de FCFA. */
  prixUnitaireXof: number
}

export type TacheAvancement = {
  id: string
  methode: MethodeAvancement
  lignes: readonly LigneAvancement[]
  /** Necessaire a la methode PROPORTION_DUREE. En jours depuis l'origine. */
  debut: number
  duree: number
}

export type ResultatAvancement = {
  /** Fraction entre 0 et 1. */
  avancement: number
  /** Somme des montants du quantitatif, en FCFA. */
  budget: number
  /** Valeur acquise, en FCFA : avancement multiplie par le budget. */
  valeurAcquise: number
  /**
   * Depassement de quantitatif, en FCFA.
   *
   * Une quantite realisee au-dela du prevu ne fait PAS monter l'avancement
   * au-dessus de cent pour cent : c'est un ecart de quantitatif, qui doit etre
   * signale et traite par avenant, pas un exces de performance.
   */
  depassementXof: number
}
