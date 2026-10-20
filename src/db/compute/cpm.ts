/**
 * Calcul de reseau par la methode du chemin critique.
 *
 * Algorithme classique en trois temps : tri topologique, passe avant pour les
 * dates au plus tot, passe arriere pour les dates au plus tard. Les marges
 * s'en deduisent, et les taches de marge totale nulle forment le chemin
 * critique.
 *
 * Complexite lineaire en nombre de taches et de liaisons. Aucune dependance :
 * c'est le morceau d'algorithmique du projet, et il doit pouvoir etre lu et
 * verifie a la main. Le cas de reference de `reference.ts` a ete resolu au
 * crayon avant l'ecriture de ce fichier.
 *
 * Convention de dates : bornes INCLUSES. Une tache de duree 5 demarrant au
 * jour 0 occupe les jours 0 a 4, donc `fin = debut + duree - 1`. C'est la
 * convention du planning de chantier, ou l'on compte des journees et non des
 * instants. Elle impose le `+ 1` des liaisons fin-debut, seule subtilite du
 * module.
 */

import { etaler, etalerAvant, type CalendrierTravail } from '@/db/compute/ouvre'
import {
  ErreurCycle,
  ErreurTacheInconnue,
  type DatesTache,
  type LiaisonReseau,
  type Reseau,
  type ResultatReseau,
  type TacheReseau,
} from '@/db/compute/types'

export function calculerReseau(reseau: Reseau): ResultatReseau {
  const taches = indexer(reseau.taches)
  if (taches.size === 0) return { dates: new Map(), dureeTotale: 0, cheminCritique: [] }

  const { predecesseurs, successeurs } = relier(reseau.liaisons, taches)
  const ordre = trierTopologiquement(taches, successeurs, reseau.liaisons)

  const debutTot = new Map<string, number>()
  const finTot = new Map<string, number>()
  const cal = reseau.calendrier
  passeAvant(ordre, taches, predecesseurs, debutTot, finTot, cal)

  const dureeTotale = Math.max(...finTot.values()) + 1
  const butoir = reseau.finButoir
  const finProjet = butoir ?? dureeTotale - 1

  const debutTard = new Map<string, number>()
  const finTard = new Map<string, number>()
  passeArriere(
    ordre,
    taches,
    successeurs,
    finTot,
    debutTard,
    finTard,
    finProjet,
    butoir !== undefined,
    cal,
  )

  const dates = assembler(
    ordre,
    taches,
    successeurs,
    debutTot,
    finTot,
    debutTard,
    finTard,
    finProjet,
  )

  const cheminCritique = ordre
    .filter((id) => dates.get(id)?.critique === true)
    .sort((a, b) => (debutTot.get(a) ?? 0) - (debutTot.get(b) ?? 0))

  return { dates, dureeTotale, cheminCritique }
}

/* -------------------------------------------------------------------------- */
/* Preparation                                                                */
/* -------------------------------------------------------------------------- */

function indexer(taches: readonly TacheReseau[]): Map<string, TacheReseau> {
  const index = new Map<string, TacheReseau>()
  for (const t of taches) {
    if (index.has(t.id)) throw new Error(`Identifiant de tache en double : ${t.id}.`)
    if (!Number.isFinite(t.duree) || t.duree <= 0) {
      throw new Error(`Duree invalide pour la tache ${t.id} : ${t.duree}. Elle doit etre positive.`)
    }
    index.set(t.id, t)
  }
  return index
}

function relier(liaisons: readonly LiaisonReseau[], taches: Map<string, TacheReseau>) {
  const predecesseurs = new Map<string, LiaisonReseau[]>()
  const successeurs = new Map<string, LiaisonReseau[]>()
  for (const id of taches.keys()) {
    predecesseurs.set(id, [])
    successeurs.set(id, [])
  }
  for (const l of liaisons) {
    if (!taches.has(l.amont)) throw new ErreurTacheInconnue(l.amont)
    if (!taches.has(l.aval)) throw new ErreurTacheInconnue(l.aval)
    predecesseurs.get(l.aval)?.push(l)
    successeurs.get(l.amont)?.push(l)
  }
  return { predecesseurs, successeurs }
}

/**
 * Tri topologique par l'algorithme de Kahn.
 *
 * Si la file se vide avant d'avoir consomme toutes les taches, le reseau
 * contient un circuit. Les taches restantes contiennent le circuit et tout ce
 * qui en depend ; on isole ensuite le circuit lui-meme pour ne nommer que les
 * taches reellement fautives, car designer les taches aval induirait
 * l'utilisateur en erreur.
 */
function trierTopologiquement(
  taches: Map<string, TacheReseau>,
  successeurs: Map<string, LiaisonReseau[]>,
  liaisons: readonly LiaisonReseau[],
): string[] {
  const entrants = new Map<string, number>()
  for (const id of taches.keys()) entrants.set(id, 0)
  for (const l of liaisons) entrants.set(l.aval, (entrants.get(l.aval) ?? 0) + 1)

  // File triee, pour que le resultat soit deterministe a reseau egal.
  const file = [...entrants.entries()].filter(([, n]) => n === 0).map(([id]) => id)
  file.sort()

  const ordre: string[] = []
  while (file.length > 0) {
    const id = file.shift() as string
    ordre.push(id)
    for (const l of successeurs.get(id) ?? []) {
      const reste = (entrants.get(l.aval) ?? 0) - 1
      entrants.set(l.aval, reste)
      if (reste === 0) {
        file.push(l.aval)
        file.sort()
      }
    }
  }

  if (ordre.length !== taches.size) {
    const bloquees = new Set([...taches.keys()].filter((id) => !ordre.includes(id)))
    throw new ErreurCycle(isolerCircuit(bloquees, liaisons))
  }
  return ordre
}

/**
 * Reduit l'ensemble des taches bloquees au seul circuit.
 *
 * Une tache bloquee qui n'a aucun predecesseur bloque n'appartient pas au
 * circuit : elle en depend simplement. On les retire par passes successives
 * jusqu'a stabilite ; ce qui reste est le circuit, ou l'union des circuits.
 */
function isolerCircuit(bloquees: Set<string>, liaisons: readonly LiaisonReseau[]): string[] {
  const dansLeCircuit = new Set(bloquees)
  let stable = false
  while (!stable) {
    stable = true
    for (const id of dansLeCircuit) {
      const aUnAmontDansLeCircuit = liaisons.some(
        (l) => l.aval === id && dansLeCircuit.has(l.amont),
      )
      if (!aUnAmontDansLeCircuit) {
        dansLeCircuit.delete(id)
        stable = false
      }
    }
  }
  return [...dansLeCircuit].sort()
}

/* -------------------------------------------------------------------------- */
/* Passe avant                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Placement d'une tache sur le calendrier.
 *
 * En jours calendaires, une tache commencant au jour d finit au jour
 * d + duree - 1. En jours ouvres, son debut est porte au premier jour
 * ouvrable et sa fin au dernier de ses `duree` jours ouvrables : elle
 * s'allonge des dimanches et feries qu'elle traverse.
 */
function ouvree(t: TacheReseau, cal: CalendrierTravail | undefined): CalendrierTravail | null {
  return t.ouvre && cal ? cal : null
}

/** Debut et fin d'une tache placee au plus tot a partir du jour `debut`. */
function placer(t: TacheReseau, debut: number, cal?: CalendrierTravail) {
  const c = ouvree(t, cal)
  return c ? etaler(c, debut, t.duree) : { debut, fin: debut + t.duree - 1 }
}

/** Debut et fin d'une tache placee au plus tard pour finir le jour `fin`. */
function placerAvant(t: TacheReseau, fin: number, cal?: CalendrierTravail) {
  const c = ouvree(t, cal)
  return c ? etalerAvant(c, fin, t.duree) : { debut: fin - t.duree + 1, fin }
}

/* -------------------------------------------------------------------------- */
/* Passe avant                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Contraintes imposees a l'aval par ses liaisons. Deux types bornent son
 * debut, deux sa fin :
 *
 *   FD  debut aval >= fin amont + 1 + decalage
 *   DD  debut aval >= debut amont + decalage
 *   FF  fin aval   >= fin amont + decalage
 *   DF  fin aval   >= debut amont + decalage
 *
 * Une borne de fin se ramene a une borne de debut par le placement au plus
 * tard de la tache : en jours calendaires, debut >= fin - duree + 1.
 */
function passeAvant(
  ordre: readonly string[],
  taches: Map<string, TacheReseau>,
  predecesseurs: Map<string, LiaisonReseau[]>,
  debutTot: Map<string, number>,
  finTot: Map<string, number>,
  cal?: CalendrierTravail,
): void {
  for (const id of ordre) {
    const t = taches.get(id) as TacheReseau
    let debut = t.debutImpose ?? 0
    let finMin = Number.NEGATIVE_INFINITY

    for (const l of predecesseurs.get(id) ?? []) {
      const dAmont = debutTot.get(l.amont) as number
      const fAmont = finTot.get(l.amont) as number
      switch (l.type) {
        case 'FD':
          debut = Math.max(debut, fAmont + 1 + l.decalage)
          break
        case 'DD':
          debut = Math.max(debut, dAmont + l.decalage)
          break
        case 'FF':
          finMin = Math.max(finMin, fAmont + l.decalage)
          break
        case 'DF':
          finMin = Math.max(finMin, dAmont + l.decalage)
          break
      }
    }
    if (finMin > Number.NEGATIVE_INFINITY) {
      // Finir au plus tot le jour finMin : en jours ouvres, le premier jour
      // ouvrable qui le suit.
      const c = ouvree(t, cal)
      debut = Math.max(debut, placerAvant(t, c ? c.suivant(finMin) : finMin, cal).debut)
    }

    // Une contrainte de recouvrement ne peut pas repousser une tache avant
    // l'origine du reseau.
    const place = placer(t, Math.max(0, debut), cal)
    debutTot.set(id, place.debut)
    finTot.set(id, place.fin)
  }
}

/* -------------------------------------------------------------------------- */
/* Passe arriere                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Symetrique de la passe avant : deux types de liaison bornent la fin de
 * l'amont, deux son debut, ramene a une fin par le placement au plus tot.
 */
function passeArriere(
  ordre: readonly string[],
  taches: Map<string, TacheReseau>,
  successeurs: Map<string, LiaisonReseau[]>,
  finTot: Map<string, number>,
  debutTard: Map<string, number>,
  finTard: Map<string, number>,
  finProjet: number,
  /** Vrai si la fin vient d'une date butoir : les marges negatives sont admises. */
  butoir: boolean,
  cal?: CalendrierTravail,
): void {
  for (let i = ordre.length - 1; i >= 0; i--) {
    const id = ordre[i] as string
    const t = taches.get(id) as TacheReseau
    const aval = successeurs.get(id) ?? []

    let fin = finProjet
    let debutMax = Number.POSITIVE_INFINITY
    for (const l of aval) {
      const dTardAval = debutTard.get(l.aval) as number
      const fTardAval = finTard.get(l.aval) as number
      switch (l.type) {
        case 'FD':
          fin = Math.min(fin, dTardAval - 1 - l.decalage)
          break
        case 'DD':
          debutMax = Math.min(debutMax, dTardAval - l.decalage)
          break
        case 'FF':
          fin = Math.min(fin, fTardAval - l.decalage)
          break
        case 'DF':
          debutMax = Math.min(debutMax, fTardAval - l.decalage)
          break
      }
    }
    if (debutMax < Number.POSITIVE_INFINITY) {
      // Commencer au plus tard le jour debutMax : en jours ouvres, le dernier
      // jour ouvrable qui le precede.
      const c = ouvree(t, cal)
      fin = Math.min(fin, placer(t, c ? c.precedent(debutMax) : debutMax, cal).fin)
    }

    // Sans butoir, une contrainte de debut impose plaque la tache : elle ne
    // peut pas remonter plus tot, donc sa date au plus tard ne descend pas
    // sous sa date au plus tot. Avec un butoir, ce plancher effacerait
    // justement l'information cherchee : de combien le reseau deborde.
    const finMinimale = finTot.get(id) as number
    if (!butoir && fin < finMinimale) fin = finMinimale

    const place = placerAvant(t, fin, cal)
    finTard.set(id, place.fin)
    debutTard.set(id, place.debut)
  }
}

/* -------------------------------------------------------------------------- */
/* Marges et assemblage                                                       */
/* -------------------------------------------------------------------------- */

function assembler(
  ordre: readonly string[],
  taches: Map<string, TacheReseau>,
  successeurs: Map<string, LiaisonReseau[]>,
  debutTot: Map<string, number>,
  finTot: Map<string, number>,
  debutTard: Map<string, number>,
  finTard: Map<string, number>,
  finProjet: number,
): Map<string, DatesTache> {
  const dates = new Map<string, DatesTache>()

  for (const id of ordre) {
    const dTot = debutTot.get(id) as number
    const fTot = finTot.get(id) as number
    const dTard = debutTard.get(id) as number
    const fTard = finTard.get(id) as number
    const margeTotale = dTard - dTot

    /**
     * Marge libre : retard admissible sans repousser le debut au plus tot
     * d'aucun successeur. Pour une tache sans successeur, elle se mesure sur
     * la fin du projet.
     */
    const aval = successeurs.get(id) ?? []
    let margeLibre: number
    if (aval.length === 0) {
      margeLibre = finProjet - fTot
    } else {
      margeLibre = Math.min(
        ...aval.map((l) => {
          const dAval = debutTot.get(l.aval) as number
          const fAval = finTot.get(l.aval) as number
          switch (l.type) {
            case 'FD':
              return dAval - fTot - 1 - l.decalage
            case 'DD':
              return dAval - dTot - l.decalage
            case 'FF':
              return fAval - fTot - l.decalage
            case 'DF':
              // fin aval >= debut amont + decalage : retarder l'amont de x
              // ne deplace que son debut.
              return fAval - dTot - l.decalage
          }
        }),
      )
    }

    dates.set(id, {
      debutTot: dTot,
      finTot: fTot,
      debutTard: dTard,
      finTard: fTard,
      margeTotale,
      margeLibre: Math.max(0, Math.min(margeLibre, margeTotale)),
      // Avec un butoir depasse, le chemin critique porte une marge negative.
      critique: margeTotale <= 0,
    })
  }

  return dates
}
