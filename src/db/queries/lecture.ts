/**
 * Requetes de lecture des ecrans.
 *
 * Toutes prennent un drapeau `interne` qui commande la SELECTION DES
 * COLONNES. Lorsqu'il est faux, les donnees reservees a l'entreprise — cout
 * reel, indices de cout, effectifs — ne figurent pas dans la requete : elles
 * ne quittent pas le serveur. Les masquer a l'affichage serait une securite
 * de facade, contournable en lisant la charge utile serialisee.
 *
 * Le drapeau est derive du role par `voitDonneesInternes`, jamais passe
 * directement par un appelant.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import type { Nature, Unite } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

/* -------------------------------------------------------------------------- */
/* Synthese d'un projet                                                       */
/* -------------------------------------------------------------------------- */

export type EnTeteProjet = {
  id: string
  code: string
  nom: string
  maitreOuvrage: string
  maitreOeuvre: string
  entreprise: string
  lieu: string
  dateOrdreService: string
  dateFinContractuelle: string
  dureeContractuelleJ: number
  montantMarcheXof: number
  tauxPenaliteJournaliere: number
}

export type LigneLot = {
  id: string
  code: string
  nom: string
  ordre: number
  rangCouleur: number
  budgetXof: number
  avancement: number
  avancementPrevu: number
  valeurAcquiseXof: number
  valeurPlanifieeXof: number
  /** Nul pour le maitre d'ouvrage. */
  coutReelXof: number | null
  nombreTaches: number
  tachesCritiques: number
}

export type SyntheseProjet = {
  projet: EnTeteProjet
  dateAnalyse: string | null
  lots: LigneLot[]
  global: {
    avancement: number
    avancementPrevu: number
    valeurAcquiseXof: number
    valeurPlanifieeXof: number
    /** Nuls pour le maitre d'ouvrage. */
    coutReelXof: number | null
    cpi: number | null
    spi: number | null
    dateFinProjetee: string | null
  } | null
}

export async function chargerSynthese(
  db: Db,
  projetId: string,
  interne: boolean,
): Promise<SyntheseProjet> {
  const projets = await db.execute<EnTeteProjet>(sql`
    select id, code, nom,
           maitre_ouvrage as "maitreOuvrage",
           maitre_oeuvre  as "maitreOeuvre",
           entreprise, lieu,
           date_ordre_service     as "dateOrdreService",
           date_fin_contractuelle as "dateFinContractuelle",
           duree_contractuelle_j  as "dureeContractuelleJ",
           montant_marche_xof::float8 as "montantMarcheXof",
           taux_penalite_journaliere::float8 as "tauxPenaliteJournaliere"
      from projet where id = ${projetId}`)

  const projet = projets[0]
  if (!projet) throw new Error(`Projet introuvable : ${projetId}.`)

  const dates = await db.execute<{ date: string | null }>(sql`
    select max(date) as date from snapshot_avancement where projet_id = ${projetId}`)
  const dateAnalyse = dates[0]?.date ?? null

  if (dateAnalyse === null) {
    const lots = await db.execute<LigneLot>(sql`
      select l.id, l.code, l.nom, l.ordre, l.rang_couleur as "rangCouleur",
             l.budget_xof::float8 as "budgetXof",
             0::float8 as avancement, 0::float8 as "avancementPrevu",
             0::float8 as "valeurAcquiseXof", 0::float8 as "valeurPlanifieeXof",
             null::float8 as "coutReelXof",
             count(t.id) filter (where t.parent_id is not null)::int as "nombreTaches",
             0::int as "tachesCritiques"
        from lot l left join tache t on t.lot_id = l.id
       where l.projet_id = ${projetId}
       group by l.id order by l.ordre`)
    return { projet, dateAnalyse: null, lots: [...lots], global: null }
  }

  const lots = await db.execute<LigneLot>(sql`
    select l.id, l.code, l.nom, l.ordre, l.rang_couleur as "rangCouleur",
           l.budget_xof::float8 as "budgetXof",
           s.avancement_pct::float8 as avancement,
           case when l.budget_xof > 0
                then (s.valeur_planifiee_xof::float8 / l.budget_xof::float8)
                else 0 end as "avancementPrevu",
           s.valeur_acquise_xof::float8    as "valeurAcquiseXof",
           s.valeur_planifiee_xof::float8  as "valeurPlanifieeXof",
           ${interne ? sql`s.cout_reel_xof::float8` : sql`null::float8`} as "coutReelXof",
           (select count(*) from tache t
             where t.lot_id = l.id and t.parent_id is not null)::int as "nombreTaches",
           (select count(*) from tache t
             where t.lot_id = l.id and t.parent_id is not null and t.critique)::int
             as "tachesCritiques"
      from lot l
      join snapshot_avancement s
        on s.lot_id = l.id and s.date = ${dateAnalyse}::date
     where l.projet_id = ${projetId}
     order by l.ordre`)

  const consolides = await db.execute<{
    avancement: number
    valeurAcquiseXof: number
    valeurPlanifieeXof: number
    coutReelXof: number | null
    spi: number | null
    cpi: number | null
    dateFinProjetee: string | null
  }>(sql`
    select avancement_pct::float8 as avancement,
           valeur_acquise_xof::float8   as "valeurAcquiseXof",
           valeur_planifiee_xof::float8 as "valeurPlanifieeXof",
           ${interne ? sql`cout_reel_xof::float8` : sql`null::float8`} as "coutReelXof",
           spi::float8 as spi,
           ${interne ? sql`cpi::float8` : sql`null::float8`} as cpi,
           date_fin_projetee as "dateFinProjetee"
      from snapshot_avancement
     where projet_id = ${projetId} and lot_id is null and date = ${dateAnalyse}::date`)

  const c = consolides[0]

  return {
    projet,
    dateAnalyse,
    lots: [...lots],
    global: c
      ? {
          avancement: c.avancement,
          avancementPrevu:
            projet.montantMarcheXof > 0 ? c.valeurPlanifieeXof / projet.montantMarcheXof : 0,
          valeurAcquiseXof: c.valeurAcquiseXof,
          valeurPlanifieeXof: c.valeurPlanifieeXof,
          coutReelXof: c.coutReelXof,
          cpi: c.cpi,
          spi: c.spi,
          dateFinProjetee: c.dateFinProjetee,
        }
      : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Detail d'un lot                                                            */
/* -------------------------------------------------------------------------- */

export type LigneQuantitatifLue = {
  id: string
  designation: string
  unite: Unite
  quantitePrevue: number
  quantiteRealisee: number
  prixUnitaireXof: number
  montantXof: number
  valeurAcquiseXof: number
  avancement: number
}

export type TacheLue = {
  id: string
  codeWbs: string
  nom: string
  nature: Nature
  parentId: string | null
  dateDebutPrevue: string
  dateFinPrevue: string
  dureePrevueJ: number
  dateDebutReelle: string | null
  dateFinReelle: string | null
  avancement: number
  poidsBudgetaireXof: number
  margeTotaleJ: number | null
  critique: boolean
  lignes: LigneQuantitatifLue[]
}

export type DetailLot = {
  lot: { id: string; code: string; nom: string; budgetXof: number; rangCouleur: number }
  projet: { id: string; code: string; nom: string; dateOrdreService: string }
  noeuds: { id: string; codeWbs: string; nom: string; avancement: number }[]
  taches: TacheLue[]
}

export async function chargerLot(db: Db, lotId: string): Promise<DetailLot> {
  const lots = await db.execute<DetailLot['lot'] & { projetId: string }>(sql`
    select id, code, nom, budget_xof::float8 as "budgetXof",
           rang_couleur as "rangCouleur", projet_id as "projetId"
      from lot where id = ${lotId}`)
  const lot = lots[0]
  if (!lot) throw new Error(`Lot introuvable : ${lotId}.`)

  const projets = await db.execute<DetailLot['projet']>(sql`
    select id, code, nom, date_ordre_service as "dateOrdreService"
      from projet where id = ${lot.projetId}`)
  const projet = projets[0]
  if (!projet) throw new Error(`Projet introuvable : ${lot.projetId}.`)

  const taches = await db.execute<Omit<TacheLue, 'lignes'>>(sql`
    select id, code_wbs as "codeWbs", nom, nature, parent_id as "parentId",
           date_debut_prevue  as "dateDebutPrevue",
           date_fin_prevue    as "dateFinPrevue",
           duree_prevue_j     as "dureePrevueJ",
           date_debut_reelle  as "dateDebutReelle",
           date_fin_reelle    as "dateFinReelle",
           avancement_pct::float8 as avancement,
           poids_budgetaire_xof::float8 as "poidsBudgetaireXof",
           marge_totale_j as "margeTotaleJ",
           critique
      from tache where lot_id = ${lotId} order by code_wbs`)

  /**
   * Le cumul realise est agrege en une seule requete pour tout le lot. Une
   * requete par ligne de quantitatif en produirait une trentaine.
   */
  const lignes = await db.execute<LigneQuantitatifLue & { tacheId: string }>(sql`
    select q.id, q.tache_id as "tacheId", q.designation, q.unite,
           q.quantite_prevue::float8   as "quantitePrevue",
           q.prix_unitaire_xof::float8 as "prixUnitaireXof",
           q.montant_xof::float8       as "montantXof",
           coalesce(r.realise, 0)::float8 as "quantiteRealisee",
           least(coalesce(r.realise, 0), q.quantite_prevue)::float8
             * q.prix_unitaire_xof::float8 as "valeurAcquiseXof",
           case when q.quantite_prevue > 0
                then least(coalesce(r.realise, 0) / q.quantite_prevue, 1)::float8
                else 0 end as avancement
      from ligne_quantitatif q
      join tache t on t.id = q.tache_id
      left join (
        select rq.ligne_quantitatif_id as ligne, sum(rq.quantite_realisee) as realise
          from releve_quantite rq
          join releve_journalier rj on rj.id = rq.releve_journalier_id
         where rj.statut = 'VALIDE'
         group by 1
      ) r on r.ligne = q.id
     where t.lot_id = ${lotId}
     order by t.code_wbs, q.designation`)

  const parTache = new Map<string, LigneQuantitatifLue[]>()
  for (const l of lignes) {
    const { tacheId, ...reste } = l
    const liste = parTache.get(tacheId) ?? []
    liste.push(reste)
    parTache.set(tacheId, liste)
  }

  return {
    lot: {
      id: lot.id,
      code: lot.code,
      nom: lot.nom,
      budgetXof: lot.budgetXof,
      rangCouleur: lot.rangCouleur,
    },
    projet,
    noeuds: taches
      .filter((t) => t.parentId === null)
      .map((t) => ({ id: t.id, codeWbs: t.codeWbs, nom: t.nom, avancement: t.avancement })),
    taches: taches
      .filter((t) => t.parentId !== null)
      .map((t) => ({ ...t, lignes: parTache.get(t.id) ?? [] })),
  }
}

/* -------------------------------------------------------------------------- */
/* Projets accessibles                                                        */
/* -------------------------------------------------------------------------- */

export async function projetsAccessibles(
  db: Db,
  utilisateurId: string,
): Promise<{ id: string; code: string; nom: string; lieu: string }[]> {
  const lignes = await db.execute<{ id: string; code: string; nom: string; lieu: string }>(sql`
    select p.id, p.code, p.nom, p.lieu
      from projet p
      join acces_projet a on a.projet_id = p.id
     where a.utilisateur_id = ${utilisateurId}::uuid
     order by p.code`)
  return [...lignes]
}

/* -------------------------------------------------------------------------- */
/* Courbe en S                                                                */
/* -------------------------------------------------------------------------- */

export type PointCourbe = {
  date: string
  /** Valeur planifiee cumulee. */
  vp: number
  /** Valeur acquise cumulee. */
  va: number
  /** Cout reel cumule. Nul pour le maitre d'ouvrage. */
  cr: number | null
}

/**
 * Serie journaliere consolidee du projet.
 *
 * Lecture directe des instantanes precalcules : c'est precisement ce pour
 * quoi la table existe. Agreger les releves a chaque affichage couterait une
 * seconde la ou une lecture indexee en coute quelques millisecondes.
 */
export async function chargerCourbeS(
  db: Db,
  projetId: string,
  interne: boolean,
): Promise<PointCourbe[]> {
  const lignes = await db.execute<PointCourbe>(sql`
    select date,
           valeur_planifiee_xof::float8 as vp,
           valeur_acquise_xof::float8   as va,
           ${interne ? sql`cout_reel_xof::float8` : sql`null::float8`} as cr
      from snapshot_avancement
     where projet_id = ${projetId} and lot_id is null
     order by date`)
  return [...lignes]
}

/* -------------------------------------------------------------------------- */
/* Validite du compte                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Le compte porte par la session existe-t-il encore, et est-il actif ?
 *
 * Le jeton de session est un instantane valable douze heures. Sans cette
 * verification, un compte desactive conserverait son acces jusqu'a
 * expiration, et une session emise avant une reprise de donnees pointerait
 * sur un utilisateur disparu.
 *
 * Une lecture indexee par page, ce qui est le prix d'une revocation
 * immediate.
 */
export async function compteValide(db: Db, utilisateurId: string): Promise<boolean> {
  const lignes = await db.execute<{ actif: boolean }>(sql`
    select actif from utilisateur where id = ${utilisateurId}::uuid`)
  return lignes[0]?.actif === true
}
