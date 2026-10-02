/**
 * Edition du planning : regles pures.
 *
 * Le planning de reference n'est pas une liste de dates saisies une a une :
 * c'est un reseau de durees et de liaisons, dont le calcul au plus tot donne
 * les dates prevues. Modifier une duree ou une liaison, c'est donc recaler
 * toutes les dates qui en dependent, sans quoi le Gantt afficherait des
 * barres incompatibles avec leurs propres liaisons.
 *
 * Une date de debut fixee a la main devient une contrainte « pas avant »,
 * conservee a part : un recalage ulterieur la respecte au lieu de l'effacer.
 * Une date plus precoce que ce que permettent les predecesseurs est sans
 * effet, et l'appelant le signale.
 */

import { calculerReseau } from '@/db/compute/cpm'
import {
  ErreurCycle,
  type LiaisonReseau,
  type Reseau,
  type ResultatReseau,
  type TacheReseau,
} from '@/db/compute/types'

export type DatesPrevues = { debut: number; fin: number }

/** Dates prevues de chaque tache feuille : le calcul au plus tot du reseau. */
export function recaler(reseau: Reseau): {
  dates: Map<string, DatesPrevues>
  resultat: ResultatReseau
} {
  const resultat = calculerReseau(reseau)
  const dates = new Map<string, DatesPrevues>()
  for (const [id, d] of resultat.dates) dates.set(id, { debut: d.debutTot, fin: d.finTot })
  return { dates, resultat }
}

/**
 * Dates d'un noeud de la WBS : du plus tot debut au plus tard fin de ses
 * descendants. Un noeud sans descendant date n'apparait pas.
 */
export function datesNoeuds(
  noeuds: readonly { id: string; parentId: string | null }[],
  feuilles: ReadonlyMap<string, DatesPrevues & { parentId: string | null }>,
): Map<string, DatesPrevues> {
  const parent = new Map<string, string | null>()
  for (const n of noeuds) parent.set(n.id, n.parentId)

  const resultat = new Map<string, DatesPrevues>()
  for (const f of feuilles.values()) {
    let courant = f.parentId
    const vus = new Set<string>()
    while (courant !== null && !vus.has(courant)) {
      vus.add(courant)
      const d = resultat.get(courant)
      resultat.set(courant, {
        debut: d ? Math.min(d.debut, f.debut) : f.debut,
        fin: d ? Math.max(d.fin, f.fin) : f.fin,
      })
      courant = parent.get(courant) ?? null
    }
  }
  return resultat
}

export type VerdictLiaison =
  { admise: true } | { admise: false; motif: 'boucle' | 'doublon' | 'inconnue'; taches: string[] }

/**
 * Une liaison candidate est-elle admissible ? Refusee si elle relie une
 * tache a elle-meme, double une liaison existante entre les memes taches,
 * vise une tache absente, ou ferme un circuit. Dans ce dernier cas, les
 * taches du circuit sont nommees : le conducteur doit savoir quelle liaison
 * supprimer, pas seulement que quelque chose ne va pas.
 */
export function verifierLiaison(reseau: Reseau, candidate: LiaisonReseau): VerdictLiaison {
  const ids = new Set(reseau.taches.map((t) => t.id))
  if (!ids.has(candidate.amont) || !ids.has(candidate.aval)) {
    return { admise: false, motif: 'inconnue', taches: [candidate.amont, candidate.aval] }
  }
  if (candidate.amont === candidate.aval) {
    return { admise: false, motif: 'boucle', taches: [candidate.amont] }
  }
  if (reseau.liaisons.some((l) => l.amont === candidate.amont && l.aval === candidate.aval)) {
    return { admise: false, motif: 'doublon', taches: [candidate.amont, candidate.aval] }
  }
  try {
    calculerReseau({ taches: reseau.taches, liaisons: [...reseau.liaisons, candidate] })
  } catch (e) {
    if (e instanceof ErreurCycle) return { admise: false, motif: 'boucle', taches: e.taches }
    throw e
  }
  return { admise: true }
}

/**
 * Applique a une tache une nouvelle duree et, le cas echeant, une contrainte
 * de debut. Renvoie le reseau modifie, sans alterer l'original.
 */
export function modifierTache(
  reseau: Reseau,
  id: string,
  modification: { duree?: number; debutImpose?: number | null },
): Reseau {
  if (
    modification.duree !== undefined &&
    (!Number.isInteger(modification.duree) || modification.duree < 1)
  ) {
    throw new Error('Une duree est un nombre entier de jours, au moins un.')
  }
  let trouvee = false
  const taches: TacheReseau[] = reseau.taches.map((t) => {
    if (t.id !== id) return t
    trouvee = true
    const suivante: TacheReseau = { ...t }
    if (modification.duree !== undefined) suivante.duree = modification.duree
    if (modification.debutImpose === null) delete suivante.debutImpose
    else if (modification.debutImpose !== undefined) suivante.debutImpose = modification.debutImpose
    return suivante
  })
  if (!trouvee) throw new Error(`Tache inconnue : ${id}.`)
  return { taches, liaisons: reseau.liaisons }
}
