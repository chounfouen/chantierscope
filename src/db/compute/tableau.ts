/**
 * Synthese decisionnelle du tableau de bord.
 *
 * Fonctions pures, sans base ni horloge : elles prennent les instantanes
 * precalcules et quelques donnees du planning, et rendent ce que l'ecran
 * affiche. C'est ce qui permet de confronter chaque chiffre du tableau de bord
 * a un calcul de reference independant, et de tester chaque regle d'alerte
 * dans les deux sens.
 *
 * Les jours sont comptes depuis l'ordre de service, bornes incluses, comme
 * partout dans le noyau.
 */

import { avancementPrevu } from '@/db/compute/avancement'
import { calculerReseau } from '@/db/compute/cpm'
import { ecartDelaiJours, indicateurs, penaliteXof, type IndicateursEvm } from '@/db/compute/evm'
import { calendrierDepuis, etaler, type CalendrierTravail } from '@/db/compute/ouvre'
import type { LiaisonReseau, ResultatReseau, TacheReseau } from '@/db/compute/types'

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

const JOUR_MS = 86_400_000

/** Nombre de jours de `origine` a `date`, deux dates ISO sans heure. */
export function jourDepuis(origine: string, date: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${origine}T00:00:00Z`)) / JOUR_MS,
  )
}

/** Date ISO situee `jour` jours apres `origine`. */
export function dateApres(origine: string, jour: number): string {
  return new Date(Date.parse(`${origine}T00:00:00Z`) + jour * JOUR_MS).toISOString().slice(0, 10)
}

/* -------------------------------------------------------------------------- */
/* Indicateurs a une date                                                     */
/* -------------------------------------------------------------------------- */

/** Instantane consolide du projet, tel que lu dans le cache. */
export type PointSynthese = {
  date: string
  avancement: number
  vp: number
  va: number
  /** Nul pour le maitre d'ouvrage. */
  cr: number | null
  /** Fin projetee du reseau rejoue a cette date, quand elle est lue. */
  finProjetee?: string | null
}

export type CadreProjet = {
  /** Budget a l'achevement, en prix de vente. */
  bacXof: number
  /** Le meme budget exprime au cout : le debourse previsionnel. */
  budgetDebourseXof: number
  dureeContractuelleJ: number
  montantMarcheXof: number
  tauxPenaliteJournaliere: number
  /** Plafond du cumul des penalites, en fraction du marche. */
  plafondPenalite?: number
}

/**
 * Les treize indicateurs de la methode de la valeur acquise a une date, plus
 * l'avancement et l'ecart de delai lu horizontalement sur la courbe en S.
 *
 * Le coefficient de debourse n'est pas relu de l'instantane : il se deduit du
 * budget en cout et du budget en prix, ce qui garantit que EAC et VAC
 * s'expriment dans la meme base que le cout reel.
 */
export type SyntheseIndicateurs = IndicateursEvm & {
  date: string
  avancement: number
  avancementPrevu: number
  /** Ecart de delai en jours, positif pour un retard. */
  ecartDelaiJ: number
  coefficientDebourse: number
}

export function syntheseA(
  courbe: readonly PointSynthese[],
  indice: number,
  cadre: CadreProjet,
): SyntheseIndicateurs {
  const p = courbe[indice]
  if (!p) throw new Error(`Aucun instantané au rang ${indice}.`)
  const k = cadre.bacXof > 0 ? cadre.budgetDebourseXof / cadre.bacXof : 1

  const ind = indicateurs({
    coefficientDebourse: k,
    bac: cadre.bacXof,
    valeurPlanifiee: p.vp,
    valeurAcquise: p.va,
    coutReel: p.cr ?? 0,
    dureeContractuelleJ: cadre.dureeContractuelleJ,
    montantMarcheXof: cadre.montantMarcheXof,
    tauxPenaliteJournaliere: cadre.tauxPenaliteJournaliere,
    ...(cadre.plafondPenalite === undefined ? {} : { plafondPenalite: cadre.plafondPenalite }),
  })

  return {
    ...ind,
    date: p.date,
    avancement: p.avancement,
    avancementPrevu: cadre.bacXof > 0 ? p.vp / cadre.bacXof : 0,
    ecartDelaiJ: ecartDelaiJours(
      courbe.map((c) => c.vp),
      p.va,
      indice,
    ),
    coefficientDebourse: k,
  }
}

/* -------------------------------------------------------------------------- */
/* Tendances sur trente jours                                                 */
/* -------------------------------------------------------------------------- */

export const FENETRE_TENDANCE_J = 30

export type Tendance = {
  /** Valeurs journalieres de la fenetre, de la plus ancienne a la date d'analyse. */
  serie: (number | null)[]
  /** Valeur a la date d'analyse moins valeur trente jours plus tot. */
  variation: number | null
}

export type Tendances = {
  avancement: Tendance
  ecartDelaiJ: Tendance
  spi: Tendance
  cpi: Tendance
}

/**
 * Evolution des quatre indicateurs du bandeau sur les trente derniers jours.
 *
 * L'ecart de delai est relu a chaque date sur la courbe planifiee complete :
 * c'est la meme lecture horizontale que celle de la date d'analyse, faite
 * trente et une fois. Une fenetre plus courte que trente jours, en debut de
 * chantier, est rendue telle quelle, sans variation.
 */
export function tendances(courbe: readonly PointSynthese[], cadre: CadreProjet): Tendances {
  const fin = courbe.length - 1
  const debut = Math.max(0, fin - FENETRE_TENDANCE_J)
  const fenetre: SyntheseIndicateurs[] = []
  for (let i = debut; i <= fin; i++) fenetre.push(syntheseA(courbe, i, cadre))

  const complete = fin - debut === FENETRE_TENDANCE_J
  function tendance(lire: (s: SyntheseIndicateurs) => number | null): Tendance {
    const serie = fenetre.map(lire)
    const premier = serie[0]
    const dernier = serie[serie.length - 1]
    return {
      serie,
      variation:
        complete &&
        premier !== null &&
        premier !== undefined &&
        dernier !== null &&
        dernier !== undefined
          ? dernier - premier
          : null,
    }
  }

  return {
    avancement: tendance((s) => s.avancement),
    ecartDelaiJ: tendance((s) => s.ecartDelaiJ),
    spi: tendance((s) => s.spi),
    cpi: tendance((s) => (courbe[0]?.cr === null ? null : s.cpi)),
  }
}

/* -------------------------------------------------------------------------- */
/* Projection de la courbe en S                                               */
/* -------------------------------------------------------------------------- */

export type TacheBudgetee = { debut: number; duree: number; budget: number; ouvre?: boolean }

/**
 * Valeur planifiee cumulee, jour par jour, jusqu'a l'achevement du planning.
 *
 * Les instantanes s'arretent a la date d'analyse ; au-dela, la courbe
 * planifiee se prolonge par le meme calcul, applique aux dates prevues.
 */
export function courbePlanifiee(
  taches: readonly TacheBudgetee[],
  cal?: CalendrierTravail,
): number[] {
  const fin = (t: TacheBudgetee) =>
    t.ouvre && cal
      ? etaler(cal, t.debut, Math.max(t.duree, 1)).fin
      : t.debut + Math.max(t.duree, 1) - 1
  const finPlan = taches.reduce((m, t) => Math.max(m, fin(t)), -1)
  const courbe: number[] = []
  for (let j = 0; j <= finPlan; j++) {
    courbe.push(Math.round(taches.reduce((s, t) => s + avancementPrevu(t, j, cal) * t.budget, 0)))
  }
  return courbe
}

/** Lecture d'une courbe journaliere en un jour fractionnaire, par interpolation. */
function lire(courbe: readonly number[], jour: number): number {
  if (courbe.length === 0) return 0
  if (jour <= 0) return courbe[0] ?? 0
  const dernier = courbe.length - 1
  if (jour >= dernier) return courbe[dernier] ?? 0
  const bas = Math.floor(jour)
  const a = courbe[bas] ?? 0
  const b = courbe[bas + 1] ?? a
  return a + (b - a) * (jour - bas)
}

export type PointProjete = { jour: number; vp: number | null; va: number; cr: number | null }

/**
 * Projection de la valeur acquise et du cout reel au-dela de la date
 * d'analyse, tracee en pointille.
 *
 * Hypothese, enoncee dans la legende : le chantier poursuit le planning la ou
 * il en est reellement, au rythme constate. Le point de depart est la date a
 * laquelle le planifie valait la valeur acquise du jour, lue horizontalement ;
 * le planning se deroule ensuite a partir de ce point, ralenti par le SPI.
 *
 *   VA(t) = VP(t' + (t - t0) x SPI),   t' = t0 - ecart de delai
 *
 * La courbe part donc exactement de la valeur acquise du jour, et rejoint le
 * budget au bout de la duree restante divisee par le SPI.
 *
 * Le cout reel suit la valeur acquise au CPI constate : chaque franc de
 * valeur acquise coute k / CPI. Il aboutit exactement au cout estime final,
 * EAC = k x BAC / CPI.
 */
export function projeterCourbe(p: {
  courbeVp: readonly number[]
  jourAnalyse: number
  va: number
  cr: number | null
  spi: number | null
  cpi: number | null
  ecartDelaiJ: number
  coefficientDebourse: number
  bac: number
  /**
   * Fin projetee retenue, en jours depuis l'origine. Donnee, elle fixe le
   * rythme de la projection : la courbe rejoint le budget exactement a cette
   * date, et le graphique raconte la meme fin que le reste du tableau de bord.
   * Absente, le rythme est le SPI constate.
   */
  finProjeteeJ?: number
}): PointProjete[] {
  if (p.spi === null || p.spi <= 0.05) return []
  const finPlan = p.courbeVp.length - 1
  const depart = p.jourAnalyse - p.ecartDelaiJ
  if (p.va >= p.bac || depart >= finPlan) return []

  const coutParValeur =
    p.cr !== null && p.cpi !== null && p.cpi > 0 ? p.coefficientDebourse / p.cpi : null
  const finImposee =
    p.finProjeteeJ !== undefined && p.finProjeteeJ > p.jourAnalyse ? p.finProjeteeJ : null
  const rythme = finImposee === null ? p.spi : (finPlan - depart) / (finImposee - p.jourAnalyse)
  const fin = finImposee ?? p.jourAnalyse + Math.ceil((finPlan - depart) / p.spi)

  const points: PointProjete[] = []
  for (let t = p.jourAnalyse; t <= fin; t++) {
    const va = Math.min(
      p.bac,
      Math.max(p.va, lire(p.courbeVp, depart + (t - p.jourAnalyse) * rythme)),
    )
    points.push({
      jour: t,
      vp: t <= finPlan ? (p.courbeVp[t] ?? null) : null,
      va: Math.round(va),
      cr:
        coutParValeur === null || p.cr === null
          ? null
          : Math.round(p.cr + (va - p.va) * coutParValeur),
    })
  }
  return points
}

/* -------------------------------------------------------------------------- */
/* Projection du reseau                                                       */
/* -------------------------------------------------------------------------- */

const EPSILON = 1e-6

export type TacheSuivie = {
  id: string
  codeWbs: string
  nom: string
  /** Dates prevues, en jours depuis l'ordre de service. */
  debut: number
  duree: number
  /** Duree en jours ouvres, sur le calendrier passe au reseau. */
  ouvre?: boolean
  /** Contrainte de debut au plus tot du planning, s'il y en a une. */
  debutImpose: number | null
  debutReel: number | null
  finReelle: number | null
  avancement: number
  critique: boolean
}

/**
 * Fin projetee de chaque tache, compte tenu de ce qui est fait.
 *
 * Le reseau planifie est rejoue a partir de la date d'analyse :
 *
 * - une tache achevee garde ses dates reelles, et ses liaisons amont ne la
 *   contraignent plus ;
 * - une tache entamee termine son reste au rythme prevu, a partir du
 *   lendemain de la date d'analyse : reste = (1 - avancement) x duree ;
 * - une tache non commencee ne peut pas demarrer avant le lendemain de la
 *   date d'analyse, ni avant sa contrainte de debut eventuelle.
 *
 * Le resultat est la fin au plus tot ainsi recalculee. C'est la base de la
 * regle du jalon menace : un jalon l'est des que la tache qui le declenche
 * ne peut plus finir a sa date prevue.
 */
export function projeterReseau(
  taches: readonly TacheSuivie[],
  liaisons: readonly LiaisonReseau[],
  jourAnalyse: number,
  cal?: CalendrierTravail,
): Map<string, number> {
  const fins = new Map<string, number>()
  for (const [id, d] of reseauRejoue(taches, liaisons, jourAnalyse, undefined, cal).dates) {
    fins.set(id, d.finTot)
  }
  return fins
}

/**
 * Le reseau rejoue a la date d'etat, avec ses dates au plus tard et ses
 * marges. Donnee, la date butoir — la fin contractuelle — fait apparaitre des
 * marges NEGATIVES sur les taches qui la depassent : c'est le signal standard
 * d'un planning en retard, et le nombre de jours a rattraper sur chacune.
 */
export function reseauRejoue(
  taches: readonly TacheSuivie[],
  liaisons: readonly LiaisonReseau[],
  jourAnalyse: number,
  finButoir?: number,
  /** Calendrier de travail, pour les taches en jours ouvres. */
  cal?: CalendrierTravail,
): ResultatReseau {
  const fixes = new Set<string>()
  const reseau: TacheReseau[] = taches.map((t) => {
    const ouvre = t.ouvre === true && cal !== undefined
    if (t.avancement >= 1 - EPSILON) {
      fixes.add(t.id)
      const debut = t.debutReel ?? t.debut
      // Sans fin reelle, la fin prevue : en jours ouvres, etalee sur le calendrier.
      const fin = t.finReelle ?? (ouvre ? etaler(cal, debut, t.duree).fin : debut + t.duree - 1)
      return { id: t.id, duree: Math.max(1, fin - debut + 1), debutImpose: debut }
    }
    if (t.avancement > EPSILON || (t.debutReel !== null && t.debutReel <= jourAnalyse)) {
      fixes.add(t.id)
      const debut = t.debutReel ?? Math.min(t.debut, jourAnalyse)
      const reste = Math.max(1, Math.ceil((1 - t.avancement) * t.duree - EPSILON))
      // En jours ouvres, le reste se compte en journees de travail apres la
      // date d'etat ; le deja fait garde son etendue calendaire.
      return ouvre
        ? {
            id: t.id,
            duree: cal.compter(debut, jourAnalyse) + reste,
            ouvre: true,
            debutImpose: debut,
          }
        : { id: t.id, duree: jourAnalyse - debut + 1 + reste, debutImpose: debut }
    }
    return {
      id: t.id,
      duree: t.duree,
      ...(ouvre ? { ouvre: true } : {}),
      debutImpose: Math.max(jourAnalyse + 1, t.debutImpose ?? 0),
    }
  })

  return calculerReseau({
    taches: reseau,
    liaisons: liaisons.filter((l) => !fixes.has(l.aval)),
    ...(finButoir === undefined ? {} : { finButoir }),
    ...(cal === undefined ? {} : { calendrier: cal }),
  })
}

/* -------------------------------------------------------------------------- */
/* Achevement : une seule fin projetee, une seule penalite                    */
/* -------------------------------------------------------------------------- */

export type Achevement = {
  /** Fin projetee, en jours depuis l'origine : fin du reseau rejoue. */
  finProjeteeJ: number
  dateFinProjetee: string
  /** Jours de retard projetes sur la fin contractuelle. Jamais negatif. */
  retardProjeteJ: number
  /** Penalite sans plafond, pour dire ce que le plafond retient. */
  penaliteBruteXof: number
  penaliteXof: number
  plafondAtteint: boolean
  /**
   * Fourchette de retard a l'achevement, en jours, selon deux hypotheses de
   * rythme, a titre de comparaison. Negatif : avance.
   *
   * - `rythmePrevu` : le reste se deroule au rythme du planning ; le retard
   *   final egale le retard constate sur la courbe en S.
   * - `rythmeConstate` : le reste se deroule au rythme constate, mesure par
   *   le SPI temporel de l'Earned Schedule, SPI(t) = ES / AT, qui ne tend pas
   *   vers un en fin de chantier. Nul tant que rien n'est acquis.
   */
  fourchette: { rythmePrevuJ: number; rythmeConstateJ: number | null }
}

/**
 * Fin projetee et penalite du chantier, a la date d'etat.
 *
 * Trois projections coexistaient : la duree contractuelle divisee par le SPI,
 * la courbe en S prolongee au rythme du SPI, et le reseau rejoue pour les
 * jalons. Elles donnaient des retards de 36 a 125 jours sur le meme ecran. La
 * fin projetee retenue est desormais celle du reseau rejoue a la date d'etat
 * (`projeterReseau`) : c'est la methode d'un planning recale, celle qu'un
 * conducteur de travaux defend en reunion, et la seule qui tient compte des
 * liaisons. La penalite en decoule, plafonnee. Les deux autres hypotheses ne
 * servent plus qu'a encadrer ce chiffre.
 */
export function achevement(p: {
  origine: string
  fins: ReadonlyMap<string, number>
  jourAnalyse: number
  /** Duree du planning de reference, en jours. */
  dureePlanifieeJ: number
  dureeContractuelleJ: number
  /** Retard constate par lecture horizontale de la courbe en S. */
  ecartDelaiJ: number
  montantMarcheXof: number
  tauxPenaliteJournaliere: number
  plafondPenalite?: number
}): Achevement {
  // Un chantier acheve garde sa fin reelle, meme anterieure a la date d'etat.
  const finProjeteeJ = p.fins.size === 0 ? p.jourAnalyse : Math.max(...p.fins.values())
  const retardProjeteJ = Math.max(0, finProjeteeJ - (p.dureeContractuelleJ - 1))
  const brute = penaliteXof(retardProjeteJ, p.tauxPenaliteJournaliere, p.montantMarcheXof)
  const plafonnee = penaliteXof(
    retardProjeteJ,
    p.tauxPenaliteJournaliere,
    p.montantMarcheXof,
    p.plafondPenalite,
  )

  const ecoules = p.jourAnalyse + 1
  const es = ecoules - p.ecartDelaiJ
  const rythmeConstateJ =
    es > 0 ? Math.round((p.dureePlanifieeJ * ecoules) / es - p.dureeContractuelleJ) : null

  return {
    finProjeteeJ,
    dateFinProjetee: dateApres(p.origine, finProjeteeJ),
    retardProjeteJ,
    penaliteBruteXof: brute,
    penaliteXof: plafonnee,
    plafondAtteint: plafonnee < brute,
    fourchette: {
      rythmePrevuJ: Math.round(p.dureePlanifieeJ + p.ecartDelaiJ - p.dureeContractuelleJ),
      rythmeConstateJ,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Jalons                                                                     */
/* -------------------------------------------------------------------------- */

export type JalonSuivi = {
  id: string
  nom: string
  contractuel: boolean
  datePrevue: string
  dateReelle: string | null
  tacheDeclenchanteId: string | null
}

export type JalonProjete = JalonSuivi & {
  joursRestants: number
  /** Date de fin projetee de la tache declenchante, si elle est connue. */
  dateProjetee: string | null
  /** Positif : le jalon glisse. */
  glissementJ: number
  menace: boolean
}

/** Jalons non encore atteints, du plus proche au plus lointain. */
export function prochainsJalons(
  jalons: readonly JalonSuivi[],
  finsProjetees: ReadonlyMap<string, number>,
  origine: string,
  /** Date depuis laquelle se comptent les jours restants : aujourd'hui. */
  dateReference: string,
): JalonProjete[] {
  return jalons
    .filter((j) => j.dateReelle === null)
    .map((j) => {
      const fin =
        j.tacheDeclenchanteId === null ? undefined : finsProjetees.get(j.tacheDeclenchanteId)
      const dateProjetee = fin === undefined ? null : dateApres(origine, fin)
      const glissementJ = dateProjetee === null ? 0 : jourDepuis(j.datePrevue, dateProjetee)
      return {
        ...j,
        joursRestants: jourDepuis(dateReference, j.datePrevue),
        dateProjetee,
        glissementJ,
        menace: j.contractuel && glissementJ > 0,
      }
    })
    .sort((a, b) => a.datePrevue.localeCompare(b.datePrevue))
}

/* -------------------------------------------------------------------------- */
/* Alertes                                                                    */
/* -------------------------------------------------------------------------- */

/** Seuils des regles, nommes pour etre cites tels quels dans l'interface. */
export const SEUILS_ALERTE = {
  /** Une non-conformite ouverte depuis PLUS de sept jours. */
  nonConformiteJours: 7,
  /** Un releve non valide depuis PLUS de trois jours. */
  releveJours: 3,
  /** Un depassement de quantitatif SUPERIEUR a cinq pour cent. */
  depassement: 0.05,
  /** Retard minimal d'une tache critique, en jours, pour etre signale. */
  retardTacheJ: 1,
  /** Aucun releve valide depuis PLUS de trois jours. */
  absenceReleveJours: 3,
} as const

export type RegleAlerte =
  | 'TACHE_CRITIQUE_EN_RETARD'
  | 'JALON_MENACE'
  | 'NON_CONFORMITE_OUVERTE'
  | 'RELEVE_NON_VALIDE'
  | 'DEPASSEMENT_QUANTITATIF'
  | 'RELEVE_ABSENT'
  | 'INTEMPERIE_A_RECONNAITRE'

/**
 * Trois niveaux. Le niveau critique engage la date de fin ou une penalite ;
 * le niveau alerte appelle une action sous quelques jours ; le niveau
 * information signale une tache administrative en souffrance.
 */
export type NiveauAlerte = 'critique' | 'alerte' | 'information'

const RANG_NIVEAU: Record<NiveauAlerte, number> = { critique: 0, alerte: 1, information: 2 }

export type Alerte = {
  /** Stable, pour servir de cle d'affichage. */
  cle: string
  regle: RegleAlerte
  niveau: NiveauAlerte
  titre: string
  detail: string
  /** Grandeur qui ordonne les alertes d'un meme niveau, la plus forte en tete. */
  ampleur: number
  /** Objet concerne, pour le lien de l'interface. */
  cible: {
    type: 'tache' | 'jalon' | 'alea' | 'releve' | 'ligne' | 'journal' | 'contrat'
    id: string
    lotId?: string
  }
}

export type AleaSuivi = {
  id: string
  type: string
  gravite: number
  statut: 'OUVERT' | 'EN_TRAITEMENT' | 'SOLDE'
  date: string
  description: string
  lotId: string | null
}

export type ReleveSuivi = {
  id: string
  date: string
  statut: 'BROUILLON' | 'SOUMIS' | 'VALIDE' | 'RECTIFIE'
  lotId: string
  lotNom: string
}

export type LigneSuivie = {
  id: string
  designation: string
  unite: string
  codeWbs: string
  lotId: string
  quantitePrevue: number
  /** Cumul des seuls releves valides. */
  quantiteRealisee: number
}

export type EntreeAlertes = {
  origine: string
  /** Date d'etat : celle du dernier releve valide. */
  dateAnalyse: string
  /**
   * Date du jour. L'age d'un releve en attente ou d'une non-conformite se
   * compte jusqu'a elle, et non jusqu'a la date d'etat : un releve soumis
   * apres la date d'etat attend bel et bien. Absente, la date d'etat.
   */
  aujourdhui?: string
  taches: readonly TacheSuivie[]
  jalons: readonly JalonProjete[]
  aleas: readonly AleaSuivi[]
  releves: readonly ReleveSuivi[]
  lignes: readonly LigneSuivie[]
  lotParTache?: ReadonlyMap<string, string>
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${Math.abs(n) > 1 ? 's' : ''}`

/**
 * Tache critique en retard : avancement reel inferieur a l'avancement prevu
 * a la date d'analyse, d'au moins une journee de travail.
 *
 * Le retard est converti en jours par la duree de la tache : une tache de
 * vingt jours a 40 % quand elle devrait etre a 60 % a quatre jours de retard.
 * Sur le chemin critique, chacun de ces jours repousse la fin du chantier.
 */
export function regleTachesCritiques(e: EntreeAlertes): Alerte[] {
  const jour = jourDepuis(e.origine, e.dateAnalyse)
  const cal = calendrierDepuis(e.origine)
  return e.taches.flatMap((t): Alerte[] => {
    if (!t.critique || t.avancement >= 1 - EPSILON) return []
    const prevu = avancementPrevu(t, jour, cal)
    // Un retard en part de duree : en jours ouvres pour une tache ouvree.
    const retardJ = (prevu - t.avancement) * t.duree
    if (retardJ < SEUILS_ALERTE.retardTacheJ - EPSILON) return []
    const j = Math.round(retardJ)
    return [
      {
        cle: `tache:${t.id}`,
        regle: 'TACHE_CRITIQUE_EN_RETARD',
        niveau: 'critique',
        titre: `${t.codeWbs} ${t.nom}`,
        detail: `${pluriel(j, 'jour')} de retard sur le chemin critique : ${Math.round(
          t.avancement * 100,
        )} % réalisés pour ${Math.round(prevu * 100)} % prévus.`,
        ampleur: retardJ,
        cible: { type: 'tache', id: t.id, ...lot(e, t.id) },
      },
    ]
  })
}

function lot(e: EntreeAlertes, tacheId: string): { lotId?: string } {
  const lotId = e.lotParTache?.get(tacheId)
  return lotId === undefined ? {} : { lotId }
}

/** Jalon contractuel menace : la fin projetee de sa tache depasse sa date. */
export function regleJalons(e: EntreeAlertes): Alerte[] {
  return e.jalons.flatMap((j): Alerte[] =>
    j.menace
      ? [
          {
            cle: `jalon:${j.id}`,
            regle: 'JALON_MENACE',
            niveau: 'critique',
            titre: j.nom,
            detail: `Jalon contractuel projeté ${pluriel(j.glissementJ, 'jour')} après sa date${
              j.joursRestants < 0 ? ', déjà dépassée' : ''
            }.`,
            ampleur: j.glissementJ,
            cible: { type: 'jalon', id: j.id },
          },
        ]
      : [],
  )
}

/** Non-conformite non soldee, declaree depuis plus de sept jours. */
export function regleNonConformites(e: EntreeAlertes): Alerte[] {
  return e.aleas.flatMap((a): Alerte[] => {
    if (a.type !== 'NON_CONFORMITE' || a.statut === 'SOLDE') return []
    const age = jourDepuis(a.date, e.aujourdhui ?? e.dateAnalyse)
    if (age <= SEUILS_ALERTE.nonConformiteJours) return []
    return [
      {
        cle: `alea:${a.id}`,
        regle: 'NON_CONFORMITE_OUVERTE',
        niveau: 'alerte',
        titre: 'Non-conformité ouverte',
        detail: `${a.description} Ouverte depuis ${pluriel(age, 'jour')}.`,
        ampleur: age,
        cible: { type: 'alea', id: a.id, ...(a.lotId === null ? {} : { lotId: a.lotId }) },
      },
    ]
  })
}

/** Releve brouillon ou soumis, dont la journee remonte a plus de trois jours. */
export function regleReleves(e: EntreeAlertes): Alerte[] {
  return e.releves.flatMap((r): Alerte[] => {
    if (r.statut !== 'BROUILLON' && r.statut !== 'SOUMIS') return []
    const age = jourDepuis(r.date, e.aujourdhui ?? e.dateAnalyse)
    if (age <= SEUILS_ALERTE.releveJours) return []
    return [
      {
        cle: `releve:${r.id}`,
        regle: 'RELEVE_NON_VALIDE',
        niveau: 'information',
        titre: `Relevé ${r.statut === 'SOUMIS' ? 'soumis' : 'en brouillon'} non validé`,
        detail: `${r.lotNom}, journée du ${r.date.split('-').reverse().join('/')}, en attente depuis ${pluriel(
          age,
          'jour',
        )}. Il ne compte pas encore dans les indicateurs.`,
        ampleur: age,
        cible: { type: 'releve', id: r.id, lotId: r.lotId },
      },
    ]
  })
}

/** Quantite realisee superieure de plus de cinq pour cent a la quantite prevue. */
export function regleDepassements(e: EntreeAlertes): Alerte[] {
  return e.lignes.flatMap((l): Alerte[] => {
    if (l.quantitePrevue <= 0) return []
    const exces = l.quantiteRealisee / l.quantitePrevue - 1
    if (exces <= SEUILS_ALERTE.depassement + EPSILON) return []
    return [
      {
        cle: `ligne:${l.id}`,
        regle: 'DEPASSEMENT_QUANTITATIF',
        niveau: 'alerte',
        titre: `${l.codeWbs} ${l.designation}`,
        detail: `Quantité réalisée supérieure de ${(exces * 100).toFixed(1).replace('.', ',')} % au quantitatif : à régulariser par avenant.`,
        ampleur: exces,
        cible: { type: 'ligne', id: l.id, lotId: l.lotId },
      },
    ]
  })
}

/**
 * Journee d'intemperie proposee depuis le journal, pas encore reconnue ni
 * rejetee. Tant qu'elle n'est pas tranchee, elle ne prolonge pas le delai :
 * la laisser en suspens, c'est renoncer a des jours que le marche accorde.
 */
export function regleIntemperies(e: EntreeAlertes): Alerte[] {
  return e.aleas.flatMap((a): Alerte[] =>
    a.type === 'INTEMPERIE'
      ? [
          {
            cle: `intemperie:${a.id}`,
            regle: 'INTEMPERIE_A_RECONNAITRE',
            niveau: 'alerte',
            titre: 'Intempérie à reconnaître',
            detail: `Journée du ${a.date.split('-').reverse().join('/')} arrêtée par la météo. Reconnue, elle peut prolonger le délai contractuel.`,
            ampleur: jourDepuis(a.date, e.aujourdhui ?? e.dateAnalyse),
            cible: { type: 'contrat', id: a.id },
          },
        ]
      : [],
  )
}

/**
 * Aucun releve valide depuis plus de trois jours.
 *
 * Les indicateurs sont arretes a la date du dernier releve valide. Sans cette
 * alerte, un journal abandonne laisserait croire a un chantier fige dans
 * l'etat de sa derniere saisie.
 */
export function regleAbsenceReleve(e: EntreeAlertes): Alerte[] {
  if (e.aujourdhui === undefined) return []
  const age = jourDepuis(e.dateAnalyse, e.aujourdhui)
  if (age <= SEUILS_ALERTE.absenceReleveJours) return []
  return [
    {
      cle: 'journal:absence',
      regle: 'RELEVE_ABSENT',
      niveau: 'alerte',
      titre: 'Aucun relevé validé récemment',
      detail: `Dernier relevé validé le ${e.dateAnalyse
        .split('-')
        .reverse()
        .join('/')}, il y a ${pluriel(age, 'jour')}. Les indicateurs sont arrêtés à cette date.`,
      ampleur: age,
      cible: { type: 'journal', id: 'journal' },
    },
  ]
}

/**
 * Toutes les alertes, triees par criticite puis par ampleur decroissante.
 * Deux alertes de meme niveau et de meme ampleur restent dans un ordre stable,
 * celui de leur titre.
 */
export function alertes(e: EntreeAlertes): Alerte[] {
  return [
    ...regleTachesCritiques(e),
    ...regleJalons(e),
    ...regleNonConformites(e),
    ...regleDepassements(e),
    ...regleReleves(e),
    ...regleAbsenceReleve(e),
    ...regleIntemperies(e),
  ].sort(
    (a, b) =>
      RANG_NIVEAU[a.niveau] - RANG_NIVEAU[b.niveau] ||
      b.ampleur - a.ampleur ||
      a.titre.localeCompare(b.titre, 'fr'),
  )
}
