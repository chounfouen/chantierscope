/**
 * Calage du planning de reference du chantier de demonstration.
 *
 * Les dates ne sont pas declarees dans le catalogue : elles sont calculees par
 * passe avant sur le reseau des liaisons, a partir des seules durees. Une date
 * ecrite a la main finirait toujours par contredire les dependances.
 *
 * Effet secondaire utile : le moteur CPM du sprint 2, applique au meme reseau,
 * doit retrouver exactement ces dates au plus tot. C'est un test de
 * non-regression gratuit, et une verification croisee entre deux
 * implementations independantes.
 *
 * Convention de dates : le decalage est exprime en jours calendaires depuis
 * l'ordre de service, l'ordre de service etant le jour 0. Une tache occupe les
 * jours `debut` a `debut + duree - 1` inclus.
 */

import { CATALOGUE, type LigneCatalogue, type TacheCatalogue } from '@/db/seed/catalogue'
import type { MethodeAvancement, Nature, TypeLiaison } from '@/db/schema'

export type LiaisonPlanning = {
  amont: string
  aval: string
  type: TypeLiaison
  decalage: number
}

export type TachePlanning = {
  code: string
  nom: string
  lot: string
  /** Code du noeud parent dans la WBS. */
  parent: string
  nature: Nature
  methode: MethodeAvancement
  duree: number
  /** Decalage du premier jour, en jours depuis l'ordre de service. */
  debut: number
  /** Decalage du dernier jour, inclus. */
  fin: number
  lignes: readonly LigneCatalogue[]
  /** Somme des montants des lignes, en entiers de FCFA. */
  budget: number
}

export type NoeudPlanning = {
  code: string
  nom: string
  lot: string
}

export type Planning = {
  noeuds: NoeudPlanning[]
  taches: TachePlanning[]
  liaisons: LiaisonPlanning[]
  /** Duree totale du reseau, en jours calendaires. */
  dureeTotale: number
  /** Somme des budgets de taches, par code de lot. */
  budgetParLot: Map<string, number>
  budgetTotal: number
}

/** Montant d'une ligne, arrondi a l'entier de FCFA. */
export function montantLigne(ligne: LigneCatalogue): number {
  return Math.round(ligne.quantite * ligne.pu)
}

/**
 * Deroule le catalogue, resout les liaisons et cale les dates au plus tot.
 *
 * Leve si le reseau contient un cycle ou une reference a une tache inconnue :
 * un jeu de donnees incoherent doit echouer bruyamment au peuplement, pas
 * produire un planning silencieusement faux.
 */
export function calerPlanning(): Planning {
  const noeuds: NoeudPlanning[] = []
  const brutes = new Map<string, { source: TacheCatalogue; lot: string; parent: string }>()
  const liaisons: LiaisonPlanning[] = []

  for (const groupe of CATALOGUE) {
    for (const noeud of groupe.noeuds) {
      noeuds.push({ code: noeud.code, nom: noeud.nom, lot: groupe.lot })
      for (const source of noeud.enfants) {
        if (brutes.has(source.code)) throw new Error(`Code de tache en double : ${source.code}`)
        brutes.set(source.code, { source, lot: groupe.lot, parent: noeud.code })
      }
    }
  }

  for (const [code, { source }] of brutes) {
    for (const amont of source.apres ?? []) {
      liaisons.push({ amont, aval: code, type: 'FD', decalage: 0 })
    }
    for (const l of source.liaisons ?? []) {
      liaisons.push({ amont: l.amont, aval: code, type: l.type, decalage: l.decalage })
    }
  }

  for (const l of liaisons) {
    if (!brutes.has(l.amont)) throw new Error(`Liaison vers une tache inconnue : ${l.amont}`)
    if (!brutes.has(l.aval)) throw new Error(`Liaison depuis une tache inconnue : ${l.aval}`)
  }

  /* --- Tri topologique, algorithme de Kahn ------------------------------- */

  const successeurs = new Map<string, LiaisonPlanning[]>()
  const entrants = new Map<string, number>()
  for (const code of brutes.keys()) {
    successeurs.set(code, [])
    entrants.set(code, 0)
  }
  for (const l of liaisons) {
    successeurs.get(l.amont)?.push(l)
    entrants.set(l.aval, (entrants.get(l.aval) ?? 0) + 1)
  }

  const file: string[] = []
  for (const [code, n] of entrants) if (n === 0) file.push(code)
  file.sort()

  const ordre: string[] = []
  while (file.length > 0) {
    const code = file.shift() as string
    ordre.push(code)
    for (const l of successeurs.get(code) ?? []) {
      const reste = (entrants.get(l.aval) ?? 0) - 1
      entrants.set(l.aval, reste)
      if (reste === 0) file.push(l.aval)
    }
  }

  if (ordre.length !== brutes.size) {
    const enBoucle = [...brutes.keys()].filter((c) => !ordre.includes(c))
    throw new Error(`Cycle dans le reseau des liaisons : ${enBoucle.join(', ')}`)
  }

  /* --- Passe avant --------------------------------------------------------
   *
   * Semantique des quatre types de liaison, avec `debut` et `fin` inclusifs :
   *   FD  debut_aval >= fin_amont + 1 + decalage
   *   DD  debut_aval >= debut_amont + decalage
   *   FF  fin_aval   >= fin_amont + decalage
   *   DF  fin_aval   >= debut_amont + decalage
   */

  const debut = new Map<string, number>()
  const fin = new Map<string, number>()
  const predecesseurs = new Map<string, LiaisonPlanning[]>()
  for (const code of brutes.keys()) predecesseurs.set(code, [])
  for (const l of liaisons) predecesseurs.get(l.aval)?.push(l)

  for (const code of ordre) {
    const entree = brutes.get(code)
    if (!entree) throw new Error(`Tache introuvable : ${code}`)
    const duree = entree.source.duree

    let plusTot = 0
    for (const l of predecesseurs.get(code) ?? []) {
      const dAmont = debut.get(l.amont)
      const fAmont = fin.get(l.amont)
      if (dAmont === undefined || fAmont === undefined) {
        throw new Error(`Amont non cale avant ${code} : ${l.amont}`)
      }
      const contrainte =
        l.type === 'FD'
          ? fAmont + 1 + l.decalage
          : l.type === 'DD'
            ? dAmont + l.decalage
            : l.type === 'FF'
              ? fAmont + l.decalage - duree + 1
              : dAmont + l.decalage - duree + 1
      plusTot = Math.max(plusTot, contrainte)
    }

    debut.set(code, plusTot)
    fin.set(code, plusTot + duree - 1)
  }

  /* --- Assemblage --------------------------------------------------------- */

  const taches: TachePlanning[] = []
  const budgetParLot = new Map<string, number>()

  for (const [code, { source, lot, parent }] of brutes) {
    const budget = source.lignes.reduce((total, ligne) => total + montantLigne(ligne), 0)
    budgetParLot.set(lot, (budgetParLot.get(lot) ?? 0) + budget)
    taches.push({
      code,
      nom: source.nom,
      lot,
      parent,
      nature: source.nature,
      methode: source.methode ?? 'UNITES_PHYSIQUES',
      duree: source.duree,
      debut: debut.get(code) as number,
      fin: fin.get(code) as number,
      lignes: source.lignes,
      budget,
    })
  }

  taches.sort((a, b) => a.code.localeCompare(b.code))

  const dureeTotale = Math.max(...taches.map((t) => t.fin)) + 1
  const budgetTotal = [...budgetParLot.values()].reduce((a, b) => a + b, 0)

  return { noeuds, taches, liaisons, dureeTotale, budgetParLot, budgetTotal }
}
