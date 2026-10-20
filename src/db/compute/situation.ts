/**
 * Situations mensuelles de travaux : le decompte qui fonde chaque paiement.
 *
 * A la fin de chaque mois, l'entreprise presente une situation : la valeur
 * des travaux executes depuis l'origine, au prix du marche, dont on deduit
 * ce qui ne lui est pas encore du. Tout se calcule EN CUMUL, puis le montant
 * du mois est la difference de deux cumuls nets successifs :
 *
 *   travaux executes cumules         A  (valeur acquise au prix du marche)
 *   revision des prix cumulee        P = somme des travaux du mois x (Cn - 1)
 *   retenue de garantie              R = taux de retenue x (A + P)
 *   remboursement de l'avance        V = avance x part remboursee(A / marche)
 *   penalites de retard              P (seulement une fois le delai echu)
 *   net cumule                       N = A + P - R - V - Pen
 *   a payer pour le mois             N(mois) - N(mois precedent)
 *
 * Revision des prix, quand le marche est a prix revisables : chaque mois de
 * travaux est revise par le coefficient Cn = a + (1 - a) x In / I0, ou a
 * est la partie fixe, In l'index du mois et I0 celui du mois zero, celui de
 * l'etablissement des prix. Le coefficient est arrondi au millieme
 * superieur. Un index pas encore publie est remplace par le dernier connu :
 * la revision est alors provisoire, et se regularise au decompte suivant.
 *
 * Une situation presentee puis acceptee devient un decompte : ses montants
 * sont figes, car ils fondent un paiement. Le mois suivant part de ces
 * montants figes, si bien qu'une correction posterieure du journal
 * (releve rectificatif) se regularise d'elle-meme au decompte suivant, au
 * lieu de reecrire un paiement deja fait.
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
  /**
   * Vrai une fois la garantie de parfait achevement echue sans reserve
   * ouverte : la retenue est restituee, elle ne se deduit plus.
   */
  retenueRestituee?: boolean
  /** Coefficient de revision du mois ; 1 a prix fermes. */
  coefficientRevision?: number
  /** Vrai si l'index du mois n'est pas publie et a ete remplace. */
  indiceProvisoire?: boolean
}

export type StatutSituation = 'PROJETEE' | 'PRESENTEE' | 'ACCEPTEE'

/** Montants figes d'un decompte presente ou accepte. */
export type DecompteFige = {
  statut: 'PRESENTEE' | 'ACCEPTEE'
  travauxXof: number
  revisionXof: number
  retenueGarantieXof: number
  remboursementAvanceXof: number
  penalitesXof: number
  netCumuleXof: number
  aPayerXof: number
}

export type Situation = {
  numero: number
  mois: string
  date: string
  provisoire: boolean
  travauxXof: number
  /** Part du marche executee, entre zero et un. */
  execution: number
  /** Revision des prix cumulee depuis l'origine. */
  revisionXof: number
  coefficientRevision: number
  indiceProvisoire: boolean
  retenueGarantieXof: number
  remboursementAvanceXof: number
  /** Jours de retard constates a la date de la situation, delai en vigueur echu. */
  retardConstateJ: number
  penalitesXof: number
  netCumuleXof: number
  /** Ce que la situation du mois appelle en paiement. */
  aPayerXof: number
  statut: StatutSituation
}

/**
 * Coefficient de revision Cn = a + (1 - a) x In / I0, arrondi au millieme
 * superieur.
 */
export function coefficientRevision(
  partieFixe: number,
  indice: number,
  indiceZero: number,
): number {
  const brut = partieFixe + (1 - partieFixe) * (indice / indiceZero)
  // Le millieme superieur, sans que l'erreur de representation d'un
  // coefficient juste ne le pousse au millieme suivant.
  return Math.ceil(Math.round(brut * 1e9) / 1e6) / 1e3
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

export function situations(
  c: ClausesFinancieres,
  arretes: readonly Arrete[],
  figes: ReadonlyMap<string, DecompteFige> = new Map(),
): Situation[] {
  const avance = avanceXof(c)
  let netPrecedent = 0
  let travauxPrecedents = 0
  let revisionPrecedente = 0
  return arretes.map((a, i) => {
    const execution = a.montantMarcheXof > 0 ? Math.min(1, a.travauxXof / a.montantMarcheXof) : 0
    const coefficient = a.coefficientRevision ?? 1
    const indiceProvisoire = a.indiceProvisoire ?? false
    const fige = figes.get(a.mois)
    if (fige) {
      netPrecedent = fige.netCumuleXof
      travauxPrecedents = fige.travauxXof
      revisionPrecedente = fige.revisionXof
      return {
        numero: i + 1,
        mois: a.mois,
        date: a.date,
        provisoire: false,
        execution: a.montantMarcheXof > 0 ? Math.min(1, fige.travauxXof / a.montantMarcheXof) : 0,
        coefficientRevision: coefficient,
        indiceProvisoire,
        retardConstateJ: Math.max(0, joursEntre(a.finContractuelle, a.date)),
        ...fige,
      }
    }
    const travauxXof = Math.round(a.travauxXof)
    const revisionXof =
      revisionPrecedente + Math.round((travauxXof - travauxPrecedents) * (coefficient - 1))
    const retenueGarantieXof = a.retenueRestituee
      ? 0
      : Math.round(c.retenueGarantieTaux * (travauxXof + revisionXof))
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
    const netCumuleXof =
      travauxXof + revisionXof - retenueGarantieXof - remboursementAvanceXof - penalitesXof
    const aPayerXof = netCumuleXof - netPrecedent
    netPrecedent = netCumuleXof
    travauxPrecedents = travauxXof
    revisionPrecedente = revisionXof
    return {
      numero: i + 1,
      mois: a.mois,
      date: a.date,
      provisoire: a.provisoire,
      travauxXof,
      execution,
      revisionXof,
      coefficientRevision: coefficient,
      indiceProvisoire,
      retenueGarantieXof,
      remboursementAvanceXof,
      retardConstateJ,
      penalitesXof,
      netCumuleXof,
      aPayerXof,
      statut: 'PROJETEE' as const,
    }
  })
}

/**
 * Coefficient de chaque mois a partir de la serie d'index. `mois` et les
 * cles de `indices` sont au format AAAA-MM.
 */
export function coefficientsDuMois(p: {
  mois: readonly string[]
  partieFixe: number
  moisZero: string | null
  indices: ReadonlyMap<string, number>
}): Map<string, { coefficient: number; provisoire: boolean }> {
  const resultat = new Map<string, { coefficient: number; provisoire: boolean }>()
  const i0 = p.moisZero === null ? undefined : p.indices.get(p.moisZero)
  const connus = [...p.indices.keys()].sort()
  for (const m of p.mois) {
    if (i0 === undefined) {
      resultat.set(m, { coefficient: 1, provisoire: false })
      continue
    }
    const exact = p.indices.get(m)
    const dernier = connus.filter((k) => k <= m).at(-1)
    const indice = exact ?? (dernier === undefined ? i0 : (p.indices.get(dernier) as number))
    resultat.set(m, {
      coefficient: coefficientRevision(p.partieFixe, indice, i0),
      provisoire: exact === undefined,
    })
  }
  return resultat
}
