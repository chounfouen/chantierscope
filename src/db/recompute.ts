/**
 * Reconstruction integrale du cache a partir de la source de verite.
 *
 * Invariant central de la conception : il existe une fonction qui, a partir
 * des seules donnees saisies — quantites relevees, dates prevues, prix
 * unitaires, liaisons — reconstruit la totalite des valeurs derivees. Tant
 * que cet invariant tient, aucune incoherence n'est definitive : il suffit de
 * relancer le recalcul.
 *
 * Sont derivees, donc reconstruites ici :
 *   - `tache.poids_budgetaire_xof`
 *   - `tache.avancement_pct`
 *   - `tache.marge_libre_j`, `tache.marge_totale_j`, `tache.critique`
 *   - la totalite de `snapshot_avancement`
 *
 * Le recalcul est declenche a la validation d'un releve, dans la meme
 * transaction, a toute modification du planning, et chaque nuit par le cron.
 */

import { addDays, differenceInCalendarDays, formatISO, parseISO } from 'date-fns'
import { sql } from 'drizzle-orm'
import { agreger, avancementPrevu, avancementTache } from '@/db/compute/avancement'
import { calculerReseau } from '@/db/compute/cpm'
import {
  budgetDebourse,
  coefficientDebourse,
  COUT,
  coutReel,
  ecartDelaiJours,
  encadrementNecessaire,
  indicateurs,
} from '@/db/compute/evm'
import type { Reseau, ResultatAvancement } from '@/db/compute/types'
import type { db as instanceDb } from '@/db/index'
import { chargerContexte, type Contexte } from '@/db/queries/contexte'

type Db = ReturnType<typeof instanceDb>
/** Une transaction expose la meme surface que l'instance pour ce qui nous sert. */
type Executeur = Db | Parameters<Parameters<Db['transaction']>[0]>[0]

/* -------------------------------------------------------------------------- */
/* Options et resultat                                                        */
/* -------------------------------------------------------------------------- */

export type OptionsRecalcul = {
  /**
   * Date a laquelle on se place pour mesurer l'avancement.
   *
   * Par defaut la date du jour, bornee a l'intervalle contractuel. Un
   * chantier acheve ne continue pas a accumuler de la valeur planifiee, et un
   * chantier non demarre n'en a pas encore.
   */
  dateAnalyse?: string
}

export type Recalcul = {
  projetId: string
  dateAnalyse: string
  /** Nombre de taches dont le cache a ete reecrit. */
  taches: number
  /** Nombre d'instantanes journaliers ecrits. */
  instantanes: number
  avancement: number
  valeurPlanifieeXof: number
  valeurAcquiseXof: number
  coutReelXof: number
  spi: number | null
  cpi: number | null
  ecartDelaiJ: number
  dureeMs: number
}

/* -------------------------------------------------------------------------- */
/* Entree principale                                                          */
/* -------------------------------------------------------------------------- */

export async function recompute(
  executeur: Executeur,
  projetId: string,
  options: OptionsRecalcul = {},
): Promise<Recalcul> {
  const debut = Date.now()
  const contexte = await chargerContexte(executeur as Db, projetId)
  const calcul = calculer(contexte, options)

  await ecrireTaches(executeur, calcul)
  await ecrireInstantanes(executeur, projetId, calcul)

  return {
    projetId,
    dateAnalyse: calcul.dateAnalyse,
    taches: calcul.taches.length,
    instantanes: calcul.instantanes.length,
    avancement: calcul.globalFinal.avancement,
    valeurPlanifieeXof: calcul.vpFinale,
    valeurAcquiseXof: calcul.globalFinal.valeurAcquise,
    coutReelXof: calcul.crFinal,
    spi: calcul.spi,
    cpi: calcul.cpi,
    ecartDelaiJ: calcul.ecartDelaiJ,
    dureeMs: Date.now() - debut,
  }
}

/* -------------------------------------------------------------------------- */
/* Calcul                                                                     */
/* -------------------------------------------------------------------------- */

type LigneCalcul = {
  tacheId: string
  quantitePrevue: number
  quantiteRealisee: number
  prixUnitaireXof: number
}

type TacheCalcul = {
  id: string
  lotId: string
  avancementPct: number
  poidsBudgetaireXof: number
  margeLibreJ: number | null
  margeTotaleJ: number | null
  critique: boolean
}

type Instantane = {
  lotId: string | null
  date: string
  avancementPct: number
  valeurPlanifieeXof: number
  valeurAcquiseXof: number
  coutReelXof: number
  spi: number | null
  cpi: number | null
  dateFinProjetee: string | null
  budgetDebourseXof: number
}

type Calcul = {
  dateAnalyse: string
  taches: TacheCalcul[]
  instantanes: Instantane[]
  globalFinal: ResultatAvancement
  vpFinale: number
  crFinal: number
  spi: number | null
  cpi: number | null
  ecartDelaiJ: number
}

/** Partie purement calculatoire, sans acces a la base. Exportee pour les tests. */
export function calculer(contexte: Contexte, options: OptionsRecalcul = {}): Calcul {
  const { projet, lots, taches, liaisons, lignes } = contexte

  const origine = projet.dateOrdreService
  const dateAnalyse = bornerDateAnalyse(
    options.dateAnalyse ?? formatISO(new Date(), { representation: 'date' }),
    origine,
    projet.dateFinContractuelle,
  )
  const jourAnalyse = jourDepuis(origine, dateAnalyse)

  /* --- Quantites cumulees a la date d'analyse ---------------------------- */

  const cumulParLigne = new Map<string, number>()
  for (const q of contexte.quantites) {
    if (q.date > dateAnalyse) continue
    cumulParLigne.set(q.ligneId, (cumulParLigne.get(q.ligneId) ?? 0) + q.quantite)
  }

  const lignesParTache = new Map<string, LigneCalcul[]>()
  for (const l of lignes) {
    const liste = lignesParTache.get(l.tacheId) ?? []
    liste.push({
      tacheId: l.tacheId,
      quantitePrevue: l.quantitePrevue,
      quantiteRealisee: cumulParLigne.get(l.id) ?? 0,
      prixUnitaireXof: l.prixUnitaireXof,
    })
    lignesParTache.set(l.tacheId, liste)
  }

  /* --- Avancement des feuilles ------------------------------------------- */

  const feuilles = taches.filter((t) => t.feuille)
  const avancementParTache = new Map<string, ResultatAvancement>()

  for (const t of feuilles) {
    avancementParTache.set(
      t.id,
      avancementTache(
        {
          id: t.id,
          methode: t.methodeAvancement,
          lignes: lignesParTache.get(t.id) ?? [],
          debut: jourDepuis(origine, t.dateDebutPrevue),
          duree: t.dureePrevueJ,
        },
        jourAnalyse,
      ),
    )
  }

  /* --- Agregation vers les noeuds de WBS puis les lots -------------------- */

  const noeuds = taches.filter((t) => !t.feuille)
  for (const n of noeuds) {
    const enfants = feuilles.filter((f) => f.parentId === n.id)
    avancementParTache.set(n.id, agreger(enfants.map((e) => avancementParTache.get(e.id) ?? VIDE)))
  }

  /* --- Reseau : marges et criticite --------------------------------------- */

  const reseau: Reseau = {
    taches: feuilles.map((t) => ({
      id: t.id,
      duree: t.dureePrevueJ,
      ...(t.debutImpose !== null ? { debutImpose: jourDepuis(origine, t.debutImpose) } : {}),
    })),
    liaisons: liaisons.map((l) => ({
      amont: l.amont,
      aval: l.aval,
      type: l.type,
      decalage: l.decalage,
    })),
  }
  const resultatReseau = calculerReseau(reseau)

  const tachesCalcul: TacheCalcul[] = taches.map((t) => {
    const a = avancementParTache.get(t.id) ?? VIDE
    const d = resultatReseau.dates.get(t.id)
    return {
      id: t.id,
      lotId: t.lotId,
      avancementPct: arrondir(a.avancement, 6),
      poidsBudgetaireXof: a.budget,
      margeLibreJ: d?.margeLibre ?? null,
      margeTotaleJ: d?.margeTotale ?? null,
      critique: d?.critique ?? false,
    }
  })

  /* --- Courbes journalieres ----------------------------------------------- */

  const instantanes = construireInstantanes(contexte, {
    origine,
    dateAnalyse,
    jourAnalyse,
    feuilles,
    lignes,
  })

  /* --- Synthese a la date d'analyse ---------------------------------------- */

  const global = agreger(feuilles.map((f) => avancementParTache.get(f.id) ?? VIDE))
  const consolides = instantanes.filter((i) => i.lotId === null)
  const dernier = consolides[consolides.length - 1]

  const vpFinale = dernier?.valeurPlanifieeXof ?? 0
  const crFinal = dernier?.coutReelXof ?? 0
  const courbeVp = consolides.map((i) => i.valeurPlanifieeXof)

  const ind = indicateurs({
    coefficientDebourse: debourse(contexte).projet,
    bac: global.budget,
    valeurPlanifiee: vpFinale,
    valeurAcquise: global.valeurAcquise,
    coutReel: crFinal,
    dureeContractuelleJ: projet.dureeContractuelleJ,
    montantMarcheXof: projet.montantMarcheXof,
    tauxPenaliteJournaliere: projet.tauxPenaliteJournaliere,
  })

  void lots

  return {
    dateAnalyse,
    taches: tachesCalcul,
    instantanes,
    globalFinal: global,
    vpFinale,
    crFinal,
    spi: ind.spi,
    cpi: ind.cpi,
    ecartDelaiJ: ecartDelaiJours(courbeVp, global.valeurAcquise, jourAnalyse),
  }
}

/* -------------------------------------------------------------------------- */
/* Instantanes journaliers                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Construit un instantane par jour et par lot, plus un instantane consolide
 * par jour pour l'ensemble du projet.
 *
 * La valeur acquise est calculee par TACHE, en appliquant la methode
 * d'avancement de chacune, puis sommee par lot. Une premiere version sommait
 * directement les quantites plafonnees, ce qui revenait a traiter toutes les
 * taches en unites physiques : les quatre taches en jalons ponderes ou en
 * tout ou rien etaient alors valorisees differemment dans le tableau de bord
 * et dans la vue du lot, avec un ecart de 3,6 millions de FCFA. La valeur
 * acquise doit etre coherente a tous les niveaux, sans quoi l'agregation ne
 * veut plus rien dire.
 *
 * Cout : environ soixante taches evaluees sur deux cents journees, soit
 * douze mille evaluations d'une poignee de lignes chacune. Mesure a moins de
 * cent millisecondes, ce qui ne justifie pas de compliquer le code par un
 * suivi des taches modifiees.
 */
function construireInstantanes(
  contexte: Contexte,
  p: {
    origine: string
    dateAnalyse: string
    jourAnalyse: number
    feuilles: Contexte['taches']
    lignes: Contexte['lignes']
  },
): Instantane[] {
  const { projet, lots } = contexte

  /* Lignes par tache, avec une quantite realisee mutable au fil des jours. */
  const lignesParTache = new Map<string, LigneCalcul[]>()
  const ligneParId = new Map<string, LigneCalcul>()
  for (const l of p.lignes) {
    const ligne: LigneCalcul = {
      tacheId: l.tacheId,
      quantitePrevue: l.quantitePrevue,
      quantiteRealisee: 0,
      prixUnitaireXof: l.prixUnitaireXof,
    }
    ligneParId.set(l.id, ligne)
    const liste = lignesParTache.get(l.tacheId) ?? []
    liste.push(ligne)
    lignesParTache.set(l.tacheId, liste)
  }

  const budgetParLot = new Map<string, number>()
  for (const t of p.feuilles) {
    const budget = (lignesParTache.get(t.id) ?? []).reduce(
      (total, l) => total + l.quantitePrevue * l.prixUnitaireXof,
      0,
    )
    budgetParLot.set(t.lotId, (budgetParLot.get(t.lotId) ?? 0) + budget)
  }
  const budgetTotal = [...budgetParLot.values()].reduce((a, b) => a + b, 0)
  const k = debourse(contexte)

  /* Indexation par date des quantites, des moyens et des aleas. */
  const quantitesParDate = new Map<string, Contexte['quantites']>()
  for (const q of contexte.quantites) {
    if (q.date > p.dateAnalyse) continue
    const liste = quantitesParDate.get(q.date) ?? []
    liste.push(q)
    quantitesParDate.set(q.date, liste)
  }

  const moyensParDate = new Map<string, Contexte['moyens']>()
  for (const m of contexte.moyens) {
    if (m.date > p.dateAnalyse) continue
    const liste = moyensParDate.get(m.date) ?? []
    liste.push(m)
    moyensParDate.set(m.date, liste)
  }

  /*
   * Un alea rattache a un lot entre dans le cout de ce lot, donc dans le
   * cout du projet par la somme des lots. Seuls les aleas sans lot sont
   * ajoutes directement au projet : les ajouter tous compterait deux fois
   * ceux qui sont deja dans un lot.
   */
  const aleasSansLotParDate = new Map<string, number>()
  const aleasLotParDate = new Map<string, Map<string, number>>()
  for (const a of contexte.aleas) {
    if (a.date > p.dateAnalyse) continue
    if (a.lotId) {
      const parLot = aleasLotParDate.get(a.date) ?? new Map<string, number>()
      parLot.set(a.lotId, (parLot.get(a.lotId) ?? 0) + a.coutXof)
      aleasLotParDate.set(a.date, parLot)
    } else {
      aleasSansLotParDate.set(a.date, (aleasSansLotParDate.get(a.date) ?? 0) + a.coutXof)
    }
  }

  /* Cumuls de moyens, qui ne redescendent jamais. */
  const heuresParLot = new Map<string, number>()
  const encadrementParLot = new Map<string, number>()
  const aleasCumulParLot = new Map<string, number>()
  let aleasSansLotCumul = 0

  const instantanes: Instantane[] = []

  for (let j = 0; j <= p.jourAnalyse; j++) {
    const date = formatISO(addDays(parseISO(p.origine), j), { representation: 'date' })

    for (const q of quantitesParDate.get(date) ?? []) {
      const ligne = ligneParId.get(q.ligneId)
      if (ligne) ligne.quantiteRealisee += q.quantite
    }

    for (const m of moyensParDate.get(date) ?? []) {
      heuresParLot.set(m.lotId, (heuresParLot.get(m.lotId) ?? 0) + m.heuresOuvrier)
      encadrementParLot.set(m.lotId, (encadrementParLot.get(m.lotId) ?? 0) + m.encadrement)
    }

    aleasSansLotCumul += aleasSansLotParDate.get(date) ?? 0
    for (const [lotId, cout] of aleasLotParDate.get(date) ?? []) {
      aleasCumulParLot.set(lotId, (aleasCumulParLot.get(lotId) ?? 0) + cout)
    }

    /* Avancement de chaque tache a cette date, methode appliquee. */
    const vaParLot = new Map<string, number>()
    const vpParLot = new Map<string, number>()

    for (const t of p.feuilles) {
      const lignesTache = lignesParTache.get(t.id) ?? []
      const debutTache = jourDepuis(p.origine, t.dateDebutPrevue)

      const a = avancementTache(
        {
          id: t.id,
          methode: t.methodeAvancement,
          lignes: lignesTache,
          debut: debutTache,
          duree: t.dureePrevueJ,
        },
        j,
      )
      vaParLot.set(t.lotId, (vaParLot.get(t.lotId) ?? 0) + a.valeurAcquise)

      const prevu = avancementPrevu({ debut: debutTache, duree: t.dureePrevueJ }, j)
      vpParLot.set(t.lotId, (vpParLot.get(t.lotId) ?? 0) + prevu * a.budget)
    }

    let vpTotal = 0
    let vaTotal = 0
    let crLotsTotal = 0

    for (const lot of lots) {
      const budget = budgetParLot.get(lot.id) ?? 0
      const vp = Math.round(vpParLot.get(lot.id) ?? 0)
      const va = Math.round(vaParLot.get(lot.id) ?? 0)
      const cr = coutReel({
        heuresOuvrier: heuresParLot.get(lot.id) ?? 0,
        journeesEncadrement: encadrementParLot.get(lot.id) ?? 0,
        valeurAcquiseXof: va,
        // Les frais de chantier sont indirects : ils sont portes par le
        // projet, jamais repartis arbitrairement sur les lots.
        joursEcoules: 0,
        coutAleasXof: aleasCumulParLot.get(lot.id) ?? 0,
      })

      vpTotal += vp
      vaTotal += va
      crLotsTotal += cr

      instantanes.push({
        lotId: lot.id,
        date,
        avancementPct: budget > 0 ? arrondir(va / budget, 6) : 0,
        valeurPlanifieeXof: vp,
        valeurAcquiseXof: va,
        coutReelXof: cr,
        spi: vp > 0 ? arrondir(va / vp, 6) : null,
        cpi: cr > 0 ? arrondir((va * (k.parLot.get(lot.id) ?? 1)) / cr, 6) : null,
        dateFinProjetee: null,
        budgetDebourseXof: k.coutParLot.get(lot.id) ?? 0,
      })
    }

    const crProjet = crLotsTotal + (j + 1) * COUT.fraisChantierJour + aleasSansLotCumul
    const spi = vpTotal > 0 ? vaTotal / vpTotal : null
    const dateFinProjetee =
      spi !== null && spi > 0
        ? formatISO(
            addDays(
              parseISO(projet.dateOrdreService),
              Math.round(projet.dureeContractuelleJ / spi) - 1,
            ),
            { representation: 'date' },
          )
        : null

    instantanes.push({
      lotId: null,
      date,
      avancementPct: budgetTotal > 0 ? arrondir(vaTotal / budgetTotal, 6) : 0,
      valeurPlanifieeXof: vpTotal,
      valeurAcquiseXof: vaTotal,
      coutReelXof: crProjet,
      spi: spi === null ? null : arrondir(spi, 6),
      cpi: crProjet > 0 ? arrondir((vaTotal * k.projet) / crProjet, 6) : null,
      dateFinProjetee,
      budgetDebourseXof: k.coutProjet,
    })
  }

  return instantanes
}

/* -------------------------------------------------------------------------- */
/* Ecriture                                                                   */
/* -------------------------------------------------------------------------- */

async function ecrireTaches(executeur: Executeur, calcul: Calcul): Promise<void> {
  if (calcul.taches.length === 0) return

  /**
   * Mise a jour en une seule instruction, par jointure sur une table de
   * valeurs. Soixante-seize instructions distinctes couteraient soixante-seize
   * allers-retours.
   */
  const valeurs = sql.join(
    calcul.taches.map(
      (t) =>
        sql`(${t.id}::uuid, ${t.avancementPct}::numeric, ${t.poidsBudgetaireXof}::bigint,
             ${t.margeLibreJ}::integer, ${t.margeTotaleJ}::integer, ${t.critique}::boolean)`,
    ),
    sql`, `,
  )

  await executeur.execute(sql`
    update tache t set
      avancement_pct        = v.avancement,
      poids_budgetaire_xof  = v.poids,
      marge_libre_j         = v.marge_libre,
      marge_totale_j        = v.marge_totale,
      critique              = v.critique
    from (values ${valeurs}) as v(id, avancement, poids, marge_libre, marge_totale, critique)
    where t.id = v.id`)
}

async function ecrireInstantanes(
  executeur: Executeur,
  projetId: string,
  calcul: Calcul,
): Promise<void> {
  /**
   * Remplacement integral des instantanes du projet. Un `insert ... on
   * conflict` laisserait subsister les instantanes de journees devenues
   * vides, par exemple apres l'annulation d'un releve.
   *
   * L'effacement couvre aussi les dates POSTERIEURES a la date d'analyse : le
   * calcul repart toujours du premier jour, et un instantane situe au-dela
   * de la date d'analyse ne serait reconstruit par aucun recalcul a cette
   * date. Le conserver laisserait un cache que `recompute()` ne sait pas
   * reproduire.
   */
  await executeur.execute(sql`
    delete from snapshot_avancement where projet_id = ${projetId}`)

  if (calcul.instantanes.length === 0) return

  const paquet = 500
  for (let i = 0; i < calcul.instantanes.length; i += paquet) {
    const tranche = calcul.instantanes.slice(i, i + paquet)
    const valeurs = sql.join(
      tranche.map(
        (s) =>
          sql`(${projetId}::uuid, ${s.lotId}::uuid, ${s.date}::date,
               ${s.avancementPct}::numeric, ${s.valeurPlanifieeXof}::bigint,
               ${s.valeurAcquiseXof}::bigint, ${s.coutReelXof}::bigint,
               ${s.spi}::numeric, ${s.cpi}::numeric, ${s.dateFinProjetee}::date,
               ${s.budgetDebourseXof}::bigint)`,
      ),
      sql`, `,
    )
    await executeur.execute(sql`
      insert into snapshot_avancement
        (projet_id, lot_id, date, avancement_pct, valeur_planifiee_xof,
         valeur_acquise_xof, cout_reel_xof, spi, cpi, date_fin_projetee,
         budget_debourse_xof)
      values ${valeurs}`)
  }
}

/* -------------------------------------------------------------------------- */
/* Budget de debourse                                                         */
/* -------------------------------------------------------------------------- */

export type CoefficientsDebourse = {
  /** Par lot : sans frais de chantier, comme le cout reel d'un lot. */
  parLot: Map<string, number>
  /** Projet : frais de chantier compris sur la duree contractuelle. */
  projet: number
  /** Budgets au cout correspondants, en FCFA entiers. */
  coutParLot: Map<string, number>
  coutProjet: number
}

/**
 * Coefficients de debourse du projet et de chaque lot.
 *
 * Les heures planifiees viennent des equipes affectees aux taches, jour par
 * jour sur leur duree prevue ; l'encadrement planifie applique le taux
 * d'encadrement a l'effectif de chaque lot et de chaque jour, comme le
 * releve reel. Budget et cout reel suivent ainsi exactement la meme
 * structure : seule la performance peut les ecarter.
 *
 * Fonction pure du contexte, exportee pour les tests.
 */
export function debourse(contexte: Contexte): CoefficientsDebourse {
  const lotParTache = new Map(contexte.taches.map((t) => [t.id, t.lotId]))
  const venteParLot = new Map<string, number>()
  for (const l of contexte.lignes) {
    const lotId = lotParTache.get(l.tacheId)
    if (!lotId) continue
    venteParLot.set(lotId, (venteParLot.get(lotId) ?? 0) + l.quantitePrevue * l.prixUnitaireXof)
  }

  /* Effectif planifie par lot et par jour. */
  const ouvriersLotJour = new Map<string, Map<string, number>>()
  for (const e of contexte.equipes) {
    const parJour = ouvriersLotJour.get(e.lotId) ?? new Map<string, number>()
    const fin = parseISO(e.dateFin)
    for (let d = parseISO(e.dateDebut); d <= fin; d = addDays(d, 1)) {
      const cle = formatISO(d, { representation: 'date' })
      parJour.set(cle, (parJour.get(cle) ?? 0) + e.ouvriers)
    }
    ouvriersLotJour.set(e.lotId, parJour)
  }

  const parLot = new Map<string, number>()
  const coutParLot = new Map<string, number>()
  let coutProjet = 0
  let venteProjet = 0
  for (const lot of contexte.lots) {
    const vente = venteParLot.get(lot.id) ?? 0
    const jours = [...(ouvriersLotJour.get(lot.id)?.values() ?? [])]
    const cout = budgetDebourse({
      budgetVenteXof: vente,
      heuresOuvrierPrevues: jours.reduce((s, o) => s + o * COUT.heuresParJour, 0),
      journeesEncadrementPrevues: jours.reduce((s, o) => s + encadrementNecessaire(o), 0),
      joursFrais: 0,
    })
    parLot.set(lot.id, coefficientDebourse(cout, vente))
    coutParLot.set(lot.id, cout)
    coutProjet += cout
    venteProjet += vente
  }
  coutProjet += budgetDebourse({
    budgetVenteXof: 0,
    heuresOuvrierPrevues: 0,
    journeesEncadrementPrevues: 0,
    joursFrais: contexte.projet.dureeContractuelleJ,
  })

  return {
    parLot,
    projet: coefficientDebourse(coutProjet, venteProjet),
    coutParLot,
    coutProjet,
  }
}

/* -------------------------------------------------------------------------- */
/* Utilitaires                                                                */
/* -------------------------------------------------------------------------- */

const VIDE: ResultatAvancement = {
  avancement: 0,
  budget: 0,
  valeurAcquise: 0,
  depassementXof: 0,
}

function jourDepuis(origine: string, date: string): number {
  return differenceInCalendarDays(parseISO(date), parseISO(origine))
}

function bornerDateAnalyse(demandee: string, origine: string, fin: string): string {
  if (demandee < origine) return origine
  if (demandee > fin) return fin
  return demandee
}

function arrondir(v: number, decimales: number): number {
  const f = 10 ** decimales
  return Math.round(v * f) / f
}
