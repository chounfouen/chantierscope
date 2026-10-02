/**
 * Donnees du Gantt, construites cote serveur a partir du planning.
 *
 * Le composant client recoit une structure serialisable, deja exprimee en
 * jours depuis l'ordre de service : il ne manipule aucune date et ne refait
 * aucun calcul de reseau. Les dates au plus tot et au plus tard viennent du
 * calcul du reseau, les dates prevues du planning stocke ; sur un planning
 * recale, les premieres et les secondes coincident pour les debuts.
 *
 * Module pur : il se teste sans base ni navigateur.
 */

import { addDays, formatISO, parseISO } from 'date-fns'
import type { ResultatReseau } from '@/db/compute/types'
import type { Planning } from '@/db/queries/planning'
import { jourDuPlanning } from '@/db/queries/planning'
import type { TypeLiaison } from '@/db/schema'

export type ElementGantt = {
  /** Identifiant de la tache, ou `lot:<id>` pour la ligne d'un lot. */
  id: string
  parentId: string | null
  codeWbs: string
  nom: string
  genre: 'lot' | 'noeud' | 'tache'
  rangCouleur: number
  debut: number
  fin: number
  avancement: number
  budgetXof: number
  valeurAcquiseXof: number
  critique: boolean
  margeTotaleJ: number | null
  margeLibreJ: number | null
  /** Dates du reseau, pour les taches feuilles. */
  debutTot: string | null
  finTot: string | null
  debutTard: string | null
  finTard: string | null
  debutReel: string | null
  finReelle: string | null
  /** Vrai si une contrainte « pas avant » est posee. */
  contrainte: boolean
}

export type LiaisonGantt = {
  id: string
  amontId: string
  avalId: string
  type: TypeLiaison
  decalageJ: number
  critique: boolean
}

export type JalonGantt = {
  id: string
  nom: string
  contractuel: boolean
  jourPrevu: number
  jourReel: number | null
  datePrevue: string
  dateReelle: string | null
}

export type DonneesGantt = {
  origine: string
  nombreJours: number
  aujourdhui: number | null
  finContractuelle: number
  elements: ElementGantt[]
  liaisons: LiaisonGantt[]
  jalons: JalonGantt[]
}

/** Journees ajoutees apres la fin, pour que la derniere barre ne colle pas au bord. */
const MARGE_FIN_J = 21

export function construireGantt(
  planning: Planning,
  reseau: ResultatReseau,
  aujourdhui: string,
): DonneesGantt {
  const origine = planning.projet.dateOrdreService
  const jour = (d: string) => jourDuPlanning(origine, d)
  const date = (j: number) => formatISO(addDays(parseISO(origine), j), { representation: 'date' })
  const rangParLot = new Map(planning.lots.map((l) => [l.id, l.rangCouleur]))
  const lotParTache = new Map(planning.taches.map((t) => [t.id, t.lotId]))

  const elementsTaches: ElementGantt[] = planning.taches.map((t) => {
    const d = reseau.dates.get(t.id)
    return {
      id: t.id,
      parentId: t.parentId ?? `lot:${t.lotId}`,
      codeWbs: t.codeWbs,
      nom: t.nom,
      genre: t.feuille ? 'tache' : 'noeud',
      rangCouleur: rangParLot.get(t.lotId) ?? 0,
      debut: jour(t.dateDebutPrevue),
      fin: jour(t.dateFinPrevue),
      avancement: t.avancement,
      budgetXof: t.budgetXof,
      valeurAcquiseXof: Math.round(t.avancement * t.budgetXof),
      critique: t.feuille && t.critique,
      margeTotaleJ: t.feuille ? t.margeTotaleJ : null,
      margeLibreJ: t.feuille ? t.margeLibreJ : null,
      debutTot: d ? date(d.debutTot) : null,
      finTot: d ? date(d.finTot) : null,
      debutTard: d ? date(d.debutTard) : null,
      finTard: d ? date(d.finTard) : null,
      debutReel: t.dateDebutReelle,
      finReelle: t.dateFinReelle,
      contrainte: t.debutImpose !== null,
    }
  })

  const elementsLots: ElementGantt[] = planning.lots.map((l) => {
    const enfants = elementsTaches.filter(
      (e) => e.genre === 'tache' && lotParTache.get(e.id) === l.id,
    )
    const budget = enfants.reduce((s, e) => s + e.budgetXof, 0)
    const acquis = enfants.reduce((s, e) => s + e.valeurAcquiseXof, 0)
    return {
      id: `lot:${l.id}`,
      parentId: null,
      codeWbs: l.code,
      nom: l.nom,
      genre: 'lot',
      rangCouleur: l.rangCouleur,
      debut: enfants.length ? Math.min(...enfants.map((e) => e.debut)) : 0,
      fin: enfants.length ? Math.max(...enfants.map((e) => e.fin)) : 0,
      avancement: budget > 0 ? acquis / budget : 0,
      budgetXof: budget,
      valeurAcquiseXof: acquis,
      critique: false,
      margeTotaleJ: null,
      margeLibreJ: null,
      debutTot: null,
      finTot: null,
      debutTard: null,
      finTard: null,
      debutReel: null,
      finReelle: null,
      contrainte: false,
    }
  })

  const critiques = new Set(reseau.cheminCritique)
  const finMax = Math.max(0, ...elementsTaches.map((e) => e.fin))
  const finContractuelle = planning.projet.dureeContractuelleJ - 1
  const jourAujourdhui = jour(aujourdhui)

  return {
    origine,
    nombreJours: Math.max(finMax, finContractuelle) + 1 + MARGE_FIN_J,
    aujourdhui: jourAujourdhui >= 0 ? jourAujourdhui : null,
    finContractuelle,
    elements: [...elementsLots, ...elementsTaches],
    liaisons: planning.liaisons.map((l) => ({
      id: l.id,
      amontId: l.amontId,
      avalId: l.avalId,
      type: l.type,
      decalageJ: l.decalageJ,
      critique: critiques.has(l.amontId) && critiques.has(l.avalId),
    })),
    jalons: planning.jalons.map((j) => ({
      id: j.id,
      nom: j.nom,
      contractuel: j.contractuel,
      jourPrevu: jour(j.datePrevue),
      jourReel: j.dateReelle === null ? null : jour(j.dateReelle),
      datePrevue: j.datePrevue,
      dateReelle: j.dateReelle,
    })),
  }
}

export const LIBELLE_LIAISON: Record<TypeLiaison, string> = {
  FD: 'Fin → début',
  DD: 'Début → début',
  FF: 'Fin → fin',
  DF: 'Début → fin',
}

/**
 * Donnees du Gantt apres simulation : chaque tache prend ses dates au plus
 * tot simulees, les regroupements et les lots s'en deduisent, la criticite
 * est celle du reseau simule. Les barres de reference sont rendues a part,
 * en fantomes, pour la superposition.
 */
export function ganttSimule(reference: DonneesGantt, simule: ResultatReseau): DonneesGantt {
  const parId = new Map(reference.elements.map((e) => [e.id, e]))
  const elements = reference.elements.map((e) => {
    if (e.genre !== 'tache') return { ...e }
    const d = simule.dates.get(e.id)
    return d
      ? {
          ...e,
          debut: d.debutTot,
          fin: d.finTot,
          critique: d.critique,
          margeTotaleJ: d.margeTotale,
          margeLibreJ: d.margeLibre,
        }
      : { ...e }
  })
  const nouveaux = new Map(elements.map((e) => [e.id, e]))

  // Regroupements et lots : etendue de leurs descendants, du plus profond au plus haut.
  const profondeur = (e: ElementGantt): number => {
    let n = 0
    let p = e.parentId
    while (p !== null && n < 50) {
      n++
      p = parId.get(p)?.parentId ?? null
    }
    return n
  }
  const regroupements = elements
    .filter((e) => e.genre !== 'tache')
    .sort((a, b) => profondeur(b) - profondeur(a))
  for (const r of regroupements) {
    const enfants = elements.filter((e) => e.parentId === r.id)
    if (enfants.length === 0) continue
    const n = nouveaux.get(r.id)
    if (!n) continue
    n.debut = Math.min(...enfants.map((e) => nouveaux.get(e.id)?.debut ?? e.debut))
    n.fin = Math.max(...enfants.map((e) => nouveaux.get(e.id)?.fin ?? e.fin))
  }

  const critiques = new Set(simule.cheminCritique)
  const finMax = Math.max(0, ...elements.filter((e) => e.genre === 'tache').map((e) => e.fin))
  return {
    ...reference,
    nombreJours: Math.max(reference.nombreJours, finMax + 1 + MARGE_FIN_J),
    elements,
    liaisons: reference.liaisons.map((l) => ({
      ...l,
      critique: critiques.has(l.amontId) && critiques.has(l.avalId),
    })),
  }
}

/** Barres de reference d'un Gantt, indexees par tache, pour la superposition. */
export function fantomesDe(
  reference: DonneesGantt,
): Record<string, { debut: number; fin: number }> {
  return Object.fromEntries(
    reference.elements
      .filter((e) => e.genre === 'tache')
      .map((e) => [e.id, { debut: e.debut, fin: e.fin }]),
  )
}
