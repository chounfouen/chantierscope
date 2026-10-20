/**
 * Situations mensuelles de travaux : le decompte qui fonde chaque paiement.
 *
 * A la fin de chaque mois, l'entreprise presente une situation : la valeur
 * des travaux executes depuis l'origine, au prix du marche, dont on deduit
 * ce qui ne lui est pas encore du. Tout se calcule EN CUMUL, puis le montant
 * du mois est la difference de deux cumuls nets successifs :
 *
 *   travaux executes cumules         A  (valeur acquise au prix du marche)
 *   retenue de garantie              R = taux de retenue x A
 *   remboursement de l'avance        V = avance x part remboursee(A / marche)
 *   penalites de retard              P (seulement une fois le delai echu)
 *   net cumule                       N = A - R - V - P
 *   a payer pour le mois             N(mois) - N(mois precedent)
 *
 * L'avance de demarrage est versee a l'origine. Son remboursement est
 * lineaire entre deux seuils d'execution fixes au CCAP : rien en dessous du
 * premier, la totalite au second.
 *
 * Montants hors taxes, en FCFA entiers : chaque ligne cumulee est arrondie,
 * et le montant du mois en est la difference exacte. La somme des montants
 * mensuels redonne donc le net cumule au franc pres, sans derive d'arrondi.
 *
 * Fonctions pures : la base fournit les arretes, le noyau decompte.
 */

import { penaliteXof } from '@/db/compute/evm'

const JOUR_MS = 86_400_000

export type ClausesFinancieres = {
  /** Fraction des travaux retenue en garantie, rendue a la reception. */
  retenueGarantieTaux: number
  /** Avance de demarrage, en fraction du montant initial du marche. */
  avanceTaux: number
  /** Seuils d'execution, en fraction du marche, qui bornent le remboursement. */
  remboursementDebut: number
  remboursementFin: number
  montantInitialXof: number
  tauxPenaliteJournaliere: number
  plafondPenalite: number
}

/** Ce que la base arrete a la fin d'un mois. */
export type Arrete = {
  /** Mois de la situation, `AAAA-MM`. */
  mois: string
  /** Dernier releve pris en compte : fin de mois, ou date d'etat du mois en cours. */
  date: string
  /** Valeur acquise cumulee a cette date, au prix du marche. */
  travauxXof: number
  /** Marche en vigueur a cette date. */
  montantMarcheXof: number
  finContractuelle: string
  /** Vrai pour le mois en cours, arrete a la date d'etat. */
  provisoire: boolean
}

export type Situation = {
  numero: number
  mois: string
  date: string
  provisoire: boolean
  travauxXof: number
  /** Part du marche executee, entre zero et un. */
  execution: number
  retenueGarantieXof: number
  remboursementAvanceXof: number
  /** Jours de retard constates a la date de la situation, delai en vigueur echu. */
  retardConstateJ: number
  penalitesXof: number
  netCumuleXof: number
  /** Ce que la situation du mois appelle en paiement. */
  aPayerXof: number
}

export function avanceXof(c: ClausesFinancieres): number {
  return Math.round(c.avanceTaux * c.montantInitialXof)
}

/** Part de l'avance remboursee a un niveau d'execution donne. */
export function partRemboursee(execution: number, debut: number, fin: number): number {
  if (execution <= debut) return 0
  if (execution >= fin || fin <= debut) return 1
  return (execution - debut) / (fin - debut)
}

function joursEntre(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / JOUR_MS)
}

export function situations(c: ClausesFinancieres, arretes: readonly Arrete[]): Situation[] {
  const avance = avanceXof(c)
  let netPrecedent = 0
  return arretes.map((a, i) => {
    const execution = a.montantMarcheXof > 0 ? Math.min(1, a.travauxXof / a.montantMarcheXof) : 0
    const travauxXof = Math.round(a.travauxXof)
    const retenueGarantieXof = Math.round(c.retenueGarantieTaux * travauxXof)
    const remboursementAvanceXof = Math.round(
      avance * partRemboursee(execution, c.remboursementDebut, c.remboursementFin),
    )
    // Avant l'echeance du delai, aucune penalite n'est constatee : le retard
    // projete reste une prevision, il ne se retient pas sur un paiement.
    const retardConstateJ = Math.max(0, joursEntre(a.finContractuelle, a.date))
    const penalitesXof = penaliteXof(
      retardConstateJ,
      c.tauxPenaliteJournaliere,
      a.montantMarcheXof,
      c.plafondPenalite,
    )
    const netCumuleXof = travauxXof - retenueGarantieXof - remboursementAvanceXof - penalitesXof
    const aPayerXof = netCumuleXof - netPrecedent
    netPrecedent = netCumuleXof
    return {
      numero: i + 1,
      mois: a.mois,
      date: a.date,
      provisoire: a.provisoire,
      travauxXof,
      execution,
      retenueGarantieXof,
      remboursementAvanceXof,
      retardConstateJ,
      penalitesXof,
      netCumuleXof,
      aPayerXof,
    }
  })
}
