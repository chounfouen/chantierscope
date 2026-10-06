/**
 * Lectures de la saisie journaliere et du journal de chantier.
 *
 * Le referentiel de saisie est charge EN ENTIER, tous lots confondus : le
 * formulaire doit fonctionner sans reseau, y compris si le chef de chantier
 * change de lot en cours de saisie. Cent trente lignes de quantitatif tiennent
 * en quelques kilooctets ; une requete par lot les rendrait indisponibles hors
 * ligne.
 *
 * Le journal porte les effectifs et les heures : il est reserve aux roles qui
 * voient les donnees internes, et la garde l'impose avant tout appel.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import type { StatutReleve, TypeAlea, Unite } from '@/db/schema'
import type { ReleveSaisi } from '@/lib/releve'

type Db = ReturnType<typeof instanceDb>

/* -------------------------------------------------------------------------- */
/* Referentiel du formulaire                                                  */
/* -------------------------------------------------------------------------- */

export type LigneSaisie = {
  id: string
  designation: string
  unite: Unite
  quantitePrevue: number
  /** Cumul des releves valides : celui des indicateurs. */
  cumulValide: number
  /** Cumul des releves soumis ou en brouillon, hors releve en cours d'edition. */
  cumulEnAttente: number
}

export type TacheSaisie = {
  id: string
  lotId: string
  codeWbs: string
  nom: string
  dateDebutPrevue: string
  dateFinPrevue: string
  lignes: LigneSaisie[]
}

export type ReferentielSaisie = {
  projet: { id: string; code: string; nom: string; dateOrdreService: string }
  lots: { id: string; code: string; nom: string; rangCouleur: number }[]
  taches: TacheSaisie[]
}

/**
 * Lots, taches feuilles et lignes du quantitatif, avec les cumuls deja
 * realises. `exclureReleveId` retire du cumul en attente le releve en cours de
 * modification, sans quoi ses propres quantites declencheraient l'alerte de
 * depassement contre elles-memes.
 */
export async function chargerReferentielSaisie(
  db: Db,
  projetId: string,
  exclureReleveId: string | null = null,
): Promise<ReferentielSaisie> {
  const [projets, lots, taches, lignes] = await Promise.all([
    db.execute<ReferentielSaisie['projet']>(sql`
      select id, code, nom, date_ordre_service as "dateOrdreService"
        from projet where id = ${projetId}::uuid`),
    db.execute<ReferentielSaisie['lots'][number]>(sql`
      select id, code, nom, rang_couleur as "rangCouleur"
        from lot where projet_id = ${projetId}::uuid order by ordre`),
    db.execute<Omit<TacheSaisie, 'lignes'>>(sql`
      select t.id, t.lot_id as "lotId", t.code_wbs as "codeWbs", t.nom,
             t.date_debut_prevue as "dateDebutPrevue", t.date_fin_prevue as "dateFinPrevue"
        from tache t join lot l on l.id = t.lot_id
       where l.projet_id = ${projetId}::uuid and t.parent_id is not null
       order by t.code_wbs`),
    db.execute<LigneSaisie & { tacheId: string }>(sql`
      select q.id, q.tache_id as "tacheId", q.designation, q.unite,
             q.quantite_prevue::float8 as "quantitePrevue",
             coalesce(c.valide, 0)::float8 as "cumulValide",
             coalesce(c.attente, 0)::float8 as "cumulEnAttente"
        from ligne_quantitatif q
        join tache t on t.id = q.tache_id
        join lot l on l.id = t.lot_id
        left join (
          select rq.ligne_quantitatif_id as ligne,
                 sum(rq.quantite_realisee) filter (where r.statut = 'VALIDE') as valide,
                 sum(rq.quantite_realisee) filter (
                   where r.statut in ('SOUMIS', 'BROUILLON')
                     and r.id is distinct from ${exclureReleveId}::uuid) as attente
            from releve_quantite rq
            join releve_journalier r on r.id = rq.releve_journalier_id
           where r.projet_id = ${projetId}::uuid
           group by 1
        ) c on c.ligne = q.id
       where l.projet_id = ${projetId}::uuid
       order by t.code_wbs, q.designation`),
  ])

  const projet = projets[0]
  if (!projet) throw new Error(`Projet introuvable : ${projetId}.`)

  const parTache = new Map<string, LigneSaisie[]>()
  for (const { tacheId, ...ligne } of lignes) {
    const liste = parTache.get(tacheId) ?? []
    liste.push(ligne)
    parTache.set(tacheId, liste)
  }

  return {
    projet,
    lots: [...lots],
    taches: taches
      .map((t) => ({ ...t, lignes: parTache.get(t.id) ?? [] }))
      .filter((t) => t.lignes.length > 0),
  }
}

/* -------------------------------------------------------------------------- */
/* Journal de chantier                                                        */
/* -------------------------------------------------------------------------- */

export type FiltresJournal = {
  lotId?: string | undefined
  du?: string | undefined
  au?: string | undefined
  statut?: StatutReleve | undefined
}

export type EntreeJournal = {
  id: string
  date: string
  lotId: string
  lotCode: string
  lotNom: string
  rangCouleur: number
  statut: StatutReleve
  journeeTravaillee: boolean
  motifArret: string | null
  effectifOuvriers: number
  heuresTravaillees: number
  precipitationsMm: number | null
  nombreLignes: number
  aAlea: boolean
  auteur: string | null
}

/**
 * Taille d'une page du journal : une dizaine de journees, tous lots
 * confondus. Quatre cents releves d'un coup pesaient sept cents kilooctets,
 * soit plusieurs secondes sur le reseau d'un chantier.
 */
export const LIMITE_JOURNAL = 80

export async function chargerJournal(
  db: Db,
  projetId: string,
  f: FiltresJournal,
): Promise<{ entrees: EntreeJournal[]; tronque: boolean; enAttente: number }> {
  const conditions = [sql`r.projet_id = ${projetId}::uuid`]
  if (f.lotId) conditions.push(sql`r.lot_id = ${f.lotId}::uuid`)
  if (f.du) conditions.push(sql`r.date >= ${f.du}::date`)
  if (f.au) conditions.push(sql`r.date <= ${f.au}::date`)
  if (f.statut) conditions.push(sql`r.statut = ${f.statut}::statut_releve`)

  const [entrees, attente] = await Promise.all([
    db.execute<EntreeJournal>(sql`
      select r.id, r.date, r.lot_id as "lotId", l.code as "lotCode", l.nom as "lotNom",
             l.rang_couleur as "rangCouleur", r.statut::text as statut,
             r.journee_travaillee as "journeeTravaillee", r.motif_arret as "motifArret",
             r.effectif_ouvriers as "effectifOuvriers",
             r.heures_travaillees::float8 as "heuresTravaillees",
             r.precipitations_mm::float8 as "precipitationsMm",
             (select count(*)::int from releve_quantite q
               where q.releve_journalier_id = r.id) as "nombreLignes",
             exists (select 1 from alea a where a.releve_journalier_id = r.id) as "aAlea",
             u.nom as auteur
        from releve_journalier r
        join lot l on l.id = r.lot_id
        left join utilisateur u on u.id = r.auteur_id
       where ${sql.join(conditions, sql` and `)}
       order by r.date desc, l.ordre, r.cree_le desc
       limit ${LIMITE_JOURNAL + 1}`),
    db.execute<{ n: number }>(sql`
      select count(*)::int as n from releve_journalier
       where projet_id = ${projetId}::uuid and statut = 'SOUMIS'`),
  ])

  return {
    entrees: entrees.slice(0, LIMITE_JOURNAL),
    tronque: entrees.length > LIMITE_JOURNAL,
    enAttente: Number(attente[0]?.n ?? 0),
  }
}

/* -------------------------------------------------------------------------- */
/* Detail d'un releve                                                         */
/* -------------------------------------------------------------------------- */

export type QuantiteDetail = {
  ligneId: string
  codeWbs: string
  tache: string
  designation: string
  unite: Unite
  quantite: number
  quantitePrevue: number
  commentaire: string | null
}

export type DetailReleve = {
  id: string
  projetId: string
  date: string
  lot: { id: string; code: string; nom: string; rangCouleur: number }
  statut: StatutReleve
  auteur: string | null
  auteurId: string | null
  creeLe: Date
  modifieLe: Date
  validePar: string | null
  valideLe: Date | null
  meteoCode: number | null
  temperatureC: number | null
  precipitationsMm: number | null
  rafalesKmh: number | null
  meteoCorrigee: boolean
  journeeTravaillee: boolean
  motifArret: string | null
  effectifOuvriers: number
  effectifEncadrement: number
  heuresTravaillees: number
  observations: string | null
  /** Releve qui remplace celui-ci, s'il a ete rectifie. */
  remplacePar: { id: string; date: string } | null
  /** Releve que celui-ci a remplace, s'il est un rectificatif. */
  remplace: { id: string; date: string } | null
  quantites: QuantiteDetail[]
  photos: { id: string; chemin: string; cheminVignette: string; legende: string | null }[]
  alea: {
    type: TypeAlea
    gravite: number
    description: string
    impactDelaiJ: number
    impactCoutXof: number
  } | null
}

export async function chargerReleve(db: Db, releveId: string): Promise<DetailReleve | null> {
  const [entetes, quantites, aleas, remplace, photos] = await Promise.all([
    db.execute<
      Omit<DetailReleve, 'lot' | 'quantites' | 'alea' | 'remplace' | 'remplacePar'> & {
        lotId: string
        lotCode: string
        lotNom: string
        rangCouleur: number
        remplaceParId: string | null
        remplaceParDate: string | null
      }
    >(sql`
      select r.id, r.projet_id as "projetId", r.date, r.statut::text as statut,
             r.lot_id as "lotId", l.code as "lotCode", l.nom as "lotNom",
             l.rang_couleur as "rangCouleur",
             a.nom as auteur, r.auteur_id as "auteurId", r.cree_le as "creeLe", r.modifie_le as "modifieLe",
             v.nom as "validePar", r.valide_le as "valideLe",
             r.meteo_code as "meteoCode", r.temperature_c::float8 as "temperatureC",
             r.precipitations_mm::float8 as "precipitationsMm",
             r.rafales_kmh::float8 as "rafalesKmh", r.meteo_corrigee as "meteoCorrigee",
             r.journee_travaillee as "journeeTravaillee", r.motif_arret as "motifArret",
             r.effectif_ouvriers as "effectifOuvriers",
             r.effectif_encadrement as "effectifEncadrement",
             r.heures_travaillees::float8 as "heuresTravaillees",
             r.observations,
             r.remplace_par as "remplaceParId", n.date as "remplaceParDate"
        from releve_journalier r
        join lot l on l.id = r.lot_id
        left join utilisateur a on a.id = r.auteur_id
        left join utilisateur v on v.id = r.valide_par_id
        left join releve_journalier n on n.id = r.remplace_par
       where r.id = ${releveId}::uuid`),
    db.execute<QuantiteDetail>(sql`
      select q.ligne_quantitatif_id as "ligneId", t.code_wbs as "codeWbs", t.nom as tache,
             lq.designation, lq.unite, q.quantite_realisee::float8 as quantite,
             lq.quantite_prevue::float8 as "quantitePrevue", q.commentaire
        from releve_quantite q
        join ligne_quantitatif lq on lq.id = q.ligne_quantitatif_id
        join tache t on t.id = lq.tache_id
       where q.releve_journalier_id = ${releveId}::uuid
       order by t.code_wbs, lq.designation`),
    db.execute<NonNullable<DetailReleve['alea']>>(sql`
      select type::text as type, gravite, description,
             impact_delai_j as "impactDelaiJ", impact_cout_xof::float8 as "impactCoutXof"
        from alea where releve_journalier_id = ${releveId}::uuid`),
    db.execute<{ id: string; date: string }>(sql`
      select id, date from releve_journalier where remplace_par = ${releveId}::uuid`),
    db.execute<DetailReleve['photos'][number]>(sql`
      select id, chemin, chemin_vignette as "cheminVignette", legende
        from photo where releve_journalier_id = ${releveId}::uuid order by prise_le`),
  ])

  const e = entetes[0]
  if (!e) return null
  const { lotId, lotCode, lotNom, rangCouleur, remplaceParId, remplaceParDate, ...reste } = e

  return {
    ...reste,
    lot: { id: lotId, code: lotCode, nom: lotNom, rangCouleur },
    remplacePar:
      remplaceParId !== null && remplaceParDate !== null
        ? { id: remplaceParId, date: remplaceParDate }
        : null,
    remplace: remplace[0] ?? null,
    quantites: [...quantites],
    photos: [...photos],
    alea: aleas[0] ?? null,
  }
}

/** Le detail d'un releve, sous la forme attendue par le formulaire de saisie. */
export function versSaisie(d: DetailReleve): Omit<ReleveSaisi, 'id' | 'soumettre'> {
  return {
    date: d.date,
    lotId: d.lot.id,
    meteoCode: d.meteoCode,
    temperatureC: d.temperatureC,
    precipitationsMm: d.precipitationsMm,
    rafalesKmh: d.rafalesKmh,
    meteoCorrigee: d.meteoCorrigee,
    journeeTravaillee: d.journeeTravaillee,
    motifArret: d.motifArret,
    effectifOuvriers: d.effectifOuvriers,
    effectifEncadrement: d.effectifEncadrement,
    heuresTravaillees: d.heuresTravaillees,
    quantites: d.quantites.map((q) => ({
      ligneId: q.ligneId,
      quantite: q.quantite,
      commentaire: q.commentaire,
    })),
    observations: d.observations,
    alea: d.alea,
  }
}

/* -------------------------------------------------------------------------- */
/* Serie de releves                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Journees couvertes par les releves transmis par un auteur sur un projet,
 * sur les deux dernieres annees au plus. Les brouillons ne comptent pas : la
 * serie recompense un releve transmis, pas un releve commence.
 */
export async function journeesDeReleve(
  db: Db,
  projetId: string,
  auteurId: string,
): Promise<string[]> {
  const lignes = await db.execute<{ date: string }>(sql`
    select distinct date::text as date from releve_journalier
     where projet_id = ${projetId}::uuid and auteur_id = ${auteurId}::uuid
       and statut in ('SOUMIS', 'VALIDE', 'RECTIFIE')
       and date >= current_date - interval '2 years'`)
  return lignes.map((l) => l.date)
}
