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
import { COUT, coutReel, ecartDelaiJours, indicateurs } from '@/db/compute/evm'
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
    taches: feuilles.map((t) => ({ id: t.id, duree: t.dureePrevueJ })),
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
 * Le parcours est incremental : les cumuls par ligne sont maintenus au fil
 * des jours, et la valeur acquise d'un lot est mise a jour par difference.
 * Recalculer la totalite des lignes a chaque jour donnerait le meme resultat,
 * mais en temps quadratique.
 *
 * Le plafonnement de chaque ligne a sa quantite prevue est applique sur le
 * CUMUL, et non jour par jour : c'est ce qui rend la mise a jour par
 * difference correcte.
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

  const lotParTache = new Map(p.feuilles.map((t) => [t.id, t.lotId]))
  const lotParLigne = new Map<string, string>()
  const prevuParLigne = new Map<string, number>()
  const puParLigne = new Map<string, number>()
  for (const l of p.lignes) {
    const lotId = lotParTache.get(l.tacheId)
    if (lotId) lotParLigne.set(l.id, lotId)
    prevuParLigne.set(l.id, l.quantitePrevue)
    puParLigne.set(l.id, l.prixUnitaireXof)
  }

  /* Budget par lot, et par jour la valeur planifiee de chaque lot. */
  const budgetParLot = new Map<string, number>()
  for (const l of p.lignes) {
    const lotId = lotParLigne.get(l.id)
    if (!lotId) continue
    budgetParLot.set(lotId, (budgetParLot.get(lotId) ?? 0) + l.quantitePrevue * l.prixUnitaireXof)
  }

  const budgetParTache = new Map<string, number>()
  for (const l of p.lignes) {
    budgetParTache.set(
      l.tacheId,
      (budgetParTache.get(l.tacheId) ?? 0) + l.quantitePrevue * l.prixUnitaireXof,
    )
  }

  /* Quantites et moyens indexes par date. */
  const quantitesParDate = new Map<string, typeof contexte.quantites>()
  for (const q of contexte.quantites) {
    if (q.date > p.dateAnalyse) continue
    const liste = quantitesParDate.get(q.date) ?? []
    liste.push(q)
    quantitesParDate.set(q.date, liste)
  }

  const moyensParDate = new Map<string, typeof contexte.moyens>()
  for (const m of contexte.moyens) {
    if (m.date > p.dateAnalyse) continue
    const liste = moyensParDate.get(m.date) ?? []
    liste.push(m)
    moyensParDate.set(m.date, liste)
  }

  const aleasParDate = new Map<string, number>()
  const aleasLotParDate = new Map<string, Map<string, number>>()
  for (const a of contexte.aleas) {
    if (a.date > p.dateAnalyse) continue
    aleasParDate.set(a.date, (aleasParDate.get(a.date) ?? 0) + a.coutXof)
    if (a.lotId) {
      const parLot = aleasLotParDate.get(a.date) ?? new Map<string, number>()
      parLot.set(a.lotId, (parLot.get(a.lotId) ?? 0) + a.coutXof)
      aleasLotParDate.set(a.date, parLot)
    }
  }

  /* Etat courant, mis a jour jour apres jour. */
  const cumulLigne = new Map<string, number>()
  const acquisePlafonneeLigne = new Map<string, number>()
  const vaParLot = new Map<string, number>()
  const heuresParLot = new Map<string, number>()
  const encadrementParLot = new Map<string, number>()
  const aleasCumulParLot = new Map<string, number>()
  let aleasCumulProjet = 0

  const instantanes: Instantane[] = []
  const budgetTotal = [...budgetParLot.values()].reduce((a, b) => a + b, 0)

  for (let j = 0; j <= p.jourAnalyse; j++) {
    const date = formatISO(addDays(parseISO(p.origine), j), { representation: 'date' })

    /* Quantites du jour : mise a jour des cumuls et de la valeur acquise. */
    for (const q of quantitesParDate.get(date) ?? []) {
      const prevu = prevuParLigne.get(q.ligneId)
      const pu = puParLigne.get(q.ligneId)
      const lotId = lotParLigne.get(q.ligneId)
      if (prevu === undefined || pu === undefined || lotId === undefined) continue

      const cumul = (cumulLigne.get(q.ligneId) ?? 0) + q.quantite
      cumulLigne.set(q.ligneId, cumul)

      const avant = acquisePlafonneeLigne.get(q.ligneId) ?? 0
      const apres = Math.min(cumul, prevu) * pu
      acquisePlafonneeLigne.set(q.ligneId, apres)
      vaParLot.set(lotId, (vaParLot.get(lotId) ?? 0) + (apres - avant))
    }

    /* Moyens du jour. */
    for (const m of moyensParDate.get(date) ?? []) {
      heuresParLot.set(m.lotId, (heuresParLot.get(m.lotId) ?? 0) + m.heuresOuvrier)
      encadrementParLot.set(m.lotId, (encadrementParLot.get(m.lotId) ?? 0) + m.encadrement)
    }

    /* Aleas du jour. */
    aleasCumulProjet += aleasParDate.get(date) ?? 0
    for (const [lotId, cout] of aleasLotParDate.get(date) ?? []) {
      aleasCumulParLot.set(lotId, (aleasCumulParLot.get(lotId) ?? 0) + cout)
    }

    /* Valeur planifiee du jour, par lot. */
    const vpParLot = new Map<string, number>()
    for (const t of p.feuilles) {
      const budget = budgetParTache.get(t.id) ?? 0
      if (budget === 0) continue
      const prevu = avancementPrevu(
        { debut: jourDepuis(p.origine, t.dateDebutPrevue), duree: t.dureePrevueJ },
        j,
      )
      vpParLot.set(t.lotId, (vpParLot.get(t.lotId) ?? 0) + prevu * budget)
    }

    /* Un instantane par lot. */
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
        cpi: cr > 0 ? arrondir(va / cr, 6) : null,
        dateFinProjetee: null,
      })
    }

    /* Instantane consolide du projet. */
    const crProjet = crLotsTotal + (j + 1) * COUT.fraisChantierJour + aleasCumulProjet
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
      cpi: crProjet > 0 ? arrondir(vaTotal / crProjet, 6) : null,
      dateFinProjetee,
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
   * Remplacement integral de la plage recalculee. Un `insert ... on conflict`
   * laisserait subsister les instantanes de journees devenues vides, par
   * exemple apres l'annulation d'un releve.
   */
  await executeur.execute(sql`
    delete from snapshot_avancement
     where projet_id = ${projetId} and date <= ${calcul.dateAnalyse}`)

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
               ${s.spi}::numeric, ${s.cpi}::numeric, ${s.dateFinProjetee}::date)`,
      ),
      sql`, `,
    )
    await executeur.execute(sql`
      insert into snapshot_avancement
        (projet_id, lot_id, date, avancement_pct, valeur_planifiee_xof,
         valeur_acquise_xof, cout_reel_xof, spi, cpi, date_fin_projetee)
      values ${valeurs}`)
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
