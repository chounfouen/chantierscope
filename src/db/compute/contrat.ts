/**
 * Cadre contractuel en vigueur : montant et delai du marche, apres avenants,
 * ordres de service et intemperies reconnues.
 *
 * Le marche initial est fige a la signature. Ce qui s'applique a une date
 * donnee s'en deduit :
 *
 *   montant  = montant initial + somme des avenants
 *   delai    = delai initial
 *            + jours accordes par avenant
 *            + jours des ordres de service de prolongation
 *            + jours de suspension, d'un ordre d'arret a l'ordre de reprise
 *            + journees d'intemperie reconnues AU-DELA des previsibles du CCAP
 *
 * C'est ce delai, et non le delai initial, qui fixe la date a partir de
 * laquelle les penalites courent. Sans lui, l'application penalisait des
 * jours que le marche lui-meme accorde a l'entreprise.
 *
 * Le cadre se lit A UNE DATE : seuls les actes et les intemperies datees du
 * jour ou d'avant comptent. Une analyse au 15 mai ne connait pas l'avenant
 * signe en septembre.
 *
 * Fonctions pures : ni base, ni horloge. La date du jour est un parametre.
 */

import type { DecisionIntemperie, TypeOrdreService } from '@/db/schema'

const JOUR_MS = 86_400_000

function jours(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / JOUR_MS)
}

function apres(origine: string, n: number): string {
  return new Date(Date.parse(`${origine}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10)
}

export type AvenantContrat = {
  numero: number
  date: string
  objet: string
  montantXof: number
  delaiJ: number
}

export type OrdreServiceContrat = {
  numero: number
  date: string
  type: TypeOrdreService
  objet: string
  delaiJ: number
}

export type IntemperieContrat = {
  date: string
  /** Journees d'arret couvertes par l'alea. */
  jours: number
  decision: DecisionIntemperie
}

export type CadreContractuel = {
  montantInitialXof: number
  montantAvenantsXof: number
  /** Montant du marche en vigueur, assiette des penalites. */
  montantXof: number
  dureeInitialeJ: number
  prolongations: {
    avenantsJ: number
    ordresServiceJ: number
    suspensionsJ: number
    /** Seulement la part qui depasse les journees previsibles. */
    intemperiesJ: number
  }
  intemperies: { reconnuesJ: number; previsiblesJ: number; proposeesJ: number }
  /** Delai en vigueur, en jours calendaires. */
  dureeJ: number
  /** Dernier jour du delai en vigueur. */
  finContractuelle: string
  /** Vrai si un ordre d'arret attend encore son ordre de reprise. */
  suspensionEnCours: boolean
}

export function cadreContractuel(p: {
  origine: string
  dureeInitialeJ: number
  montantInitialXof: number
  intemperiesPrevisiblesJ: number
  avenants: readonly AvenantContrat[]
  ordres: readonly OrdreServiceContrat[]
  intemperies: readonly IntemperieContrat[]
  /** Date de lecture : ecarte les actes posterieurs, borne une suspension ouverte. */
  aujourdhui: string
}): CadreContractuel {
  const enVigueur = <T extends { date: string }>(l: readonly T[]) =>
    l.filter((x) => x.date <= p.aujourdhui)
  const avenants = enVigueur(p.avenants)
  const intemperies = enVigueur(p.intemperies)
  const montantAvenantsXof = avenants.reduce((s, a) => s + a.montantXof, 0)
  const avenantsJ = avenants.reduce((s, a) => s + a.delaiJ, 0)

  const ordres = enVigueur(p.ordres).sort(
    (a, b) => a.date.localeCompare(b.date) || a.numero - b.numero,
  )
  const ordresServiceJ = ordres
    .filter((o) => o.type === 'PROLONGATION')
    .reduce((s, o) => s + o.delaiJ, 0)

  // Un ordre d'arret ouvre une suspension, le premier ordre de reprise qui le
  // suit la ferme. Un second arret pendant une suspension ne la rouvre pas.
  let suspensionsJ = 0
  let arret: string | null = null
  for (const o of ordres) {
    if (o.type === 'ARRET' && arret === null) arret = o.date
    else if (o.type === 'REPRISE' && arret !== null) {
      suspensionsJ += Math.max(0, jours(arret, o.date))
      arret = null
    }
  }
  const suspensionEnCours = arret !== null
  if (arret !== null) suspensionsJ += Math.max(0, jours(arret, p.aujourdhui))

  const somme = (d: DecisionIntemperie) =>
    intemperies.filter((i) => i.decision === d).reduce((s, i) => s + Math.max(1, i.jours), 0)
  const reconnuesJ = somme('RECONNUE')
  const intemperiesJ = Math.max(0, reconnuesJ - p.intemperiesPrevisiblesJ)

  const dureeJ = p.dureeInitialeJ + avenantsJ + ordresServiceJ + suspensionsJ + intemperiesJ
  return {
    montantInitialXof: p.montantInitialXof,
    montantAvenantsXof,
    montantXof: p.montantInitialXof + montantAvenantsXof,
    dureeInitialeJ: p.dureeInitialeJ,
    prolongations: { avenantsJ, ordresServiceJ, suspensionsJ, intemperiesJ },
    intemperies: {
      reconnuesJ,
      previsiblesJ: p.intemperiesPrevisiblesJ,
      proposeesJ: somme('PROPOSEE'),
    },
    dureeJ,
    finContractuelle: apres(p.origine, dureeJ - 1),
    suspensionEnCours,
  }
}
