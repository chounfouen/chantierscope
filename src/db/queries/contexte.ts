/**
 * Chargement du contexte complet d'un projet, pour le recalcul.
 *
 * Tout ce dont le noyau de calcul a besoin est lu en six requetes, et non en
 * une par tache. Une boucle applicative emettant une requete par tache
 * produirait soixante allers-retours la ou un seul suffit : c'est la regle 3
 * des contraintes de performance de la conception.
 *
 * Seuls les releves VALIDES alimentent les indicateurs. Un releve en
 * brouillon ou soumis n'engage encore personne : il ne doit pas faire bouger
 * l'avancement officiel du chantier. C'est aussi ce qui rend la validation
 * observable — valider un releve modifie immediatement les indicateurs.
 */

import { sql } from 'drizzle-orm'
import { COUT } from '@/db/compute/evm'
import type { db as instanceDb } from '@/db/index'
import type { MethodeAvancement, Nature, TypeLiaison } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type ProjetContexte = {
  id: string
  code: string
  nom: string
  dateOrdreService: string
  dateFinContractuelle: string
  dureeContractuelleJ: number
  montantMarcheXof: number
  tauxPenaliteJournaliere: number
  /** Plafond du cumul des penalites, en fraction du marche. */
  plafondPenalite: number
}

export type LotContexte = {
  id: string
  code: string
  nom: string
  ordre: number
  budgetXof: number
  rangCouleur: number
}

export type TacheContexte = {
  id: string
  lotId: string
  parentId: string | null
  codeWbs: string
  nom: string
  nature: Nature
  methodeAvancement: MethodeAvancement
  dateDebutPrevue: string
  dateFinPrevue: string
  dureePrevueJ: number
  /** Vrai pour une tache comptee en jours ouvres. */
  ouvre: boolean
  /** Contrainte « pas avant » posee a la main, nulle sinon. */
  debutImpose: string | null
  /** Dates reelles, quand elles sont connues. */
  dateDebutReelle: string | null
  dateFinReelle: string | null
  /** Vrai pour une tache feuille, c'est-a-dire porteuse de quantitatif. */
  feuille: boolean
}

export type LiaisonContexte = {
  amont: string
  aval: string
  type: TypeLiaison
  decalage: number
}

export type LigneContexte = {
  id: string
  tacheId: string
  quantitePrevue: number
  prixUnitaireXof: number
}

/** Quantite realisee un jour donne sur une ligne, issue des releves valides. */
export type QuantiteJournaliere = {
  ligneId: string
  date: string
  quantite: number
}

/** Moyens mobilises un jour donne sur un lot, issus des releves valides. */
export type MoyensJournaliers = {
  lotId: string
  date: string
  heuresOuvrier: number
  encadrement: number
  journeeTravaillee: boolean
  /** Heures d'engin du releve, valorisees, hors frais de chantier. */
  coutEnginsXof: number
}

/** Engin ou materiel affecte a une tache, hors frais de chantier : son cout prevu. */
export type EnginPrevu = { lotId: string; coutXof: number }

export type AleaContexte = {
  lotId: string | null
  date: string
  coutXof: number
}

export type JalonContexte = {
  id: string
  nom: string
  tacheDeclenchanteId: string | null
  contractuel: boolean
  datePrevue: string
  dateReelle: string | null
}

/**
 * Equipe affectee a une tache, en ouvriers. Base du budget de debourse : les
 * heures planifiees d'une tache sont celles de l'equipe que le planning lui
 * affecte, sur sa duree prevue.
 */
export type EquipePrevue = {
  tacheId: string
  lotId: string
  ouvriers: number
  dateDebut: string
  dateFin: string
}

export type Contexte = {
  projet: ProjetContexte
  lots: LotContexte[]
  taches: TacheContexte[]
  liaisons: LiaisonContexte[]
  lignes: LigneContexte[]
  quantites: QuantiteJournaliere[]
  moyens: MoyensJournaliers[]
  aleas: AleaContexte[]
  jalons: JalonContexte[]
  equipes: EquipePrevue[]
  enginsPrevus: EnginPrevu[]
  /**
   * Dates figees de la reference active, par tache feuille. La valeur
   * planifiee se calcule sur elles. Une tache absente de la reference, creee
   * apres le gel, est planifiee a ses dates courantes.
   */
  reference: Map<string, { debut: string; duree: number; ouvre: boolean }>
}

/* -------------------------------------------------------------------------- */
/* Chargement                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Toutes les lectures sont ordonnees. Ce n'est pas une coquetterie : la somme
 * de nombres flottants depend de leur ordre, et un budget de tache dont la
 * valeur exacte tombe sur un demi-franc s'arrondissait d'un cote ou de
 * l'autre selon l'ordre, arbitraire, dans lequel PostgreSQL rendait les
 * lignes. Deux recalculs successifs pouvaient alors differer d'un franc.
 */
export async function chargerContexte(db: Db, projetId: string): Promise<Contexte> {
  const [
    projets,
    lots,
    taches,
    liaisons,
    lignes,
    quantites,
    moyens,
    aleas,
    jalons,
    equipes,
    reference,
    enginsPrevus,
  ] = await Promise.all([
    db.execute<ProjetContexte>(sql`
        select id, code, nom,
               date_ordre_service      as "dateOrdreService",
               date_fin_contractuelle  as "dateFinContractuelle",
               duree_contractuelle_j   as "dureeContractuelleJ",
               montant_marche_xof::float8      as "montantMarcheXof",
               taux_penalite_journaliere::float8 as "tauxPenaliteJournaliere",
               plafond_penalite::float8 as "plafondPenalite"
          from projet where id = ${projetId}`),

    db.execute<LotContexte>(sql`
        select id, code, nom, ordre,
               budget_xof::float8 as "budgetXof",
               rang_couleur       as "rangCouleur"
          from lot where projet_id = ${projetId} order by ordre`),

    db.execute<TacheContexte>(sql`
        select t.id, t.lot_id as "lotId", t.parent_id as "parentId",
               t.code_wbs as "codeWbs", t.nom, t.nature,
               t.methode_avancement as "methodeAvancement",
               t.date_debut_prevue  as "dateDebutPrevue",
               t.date_fin_prevue    as "dateFinPrevue",
               t.duree_prevue_j     as "dureePrevueJ",
               t.calendrier = 'OUVRE' as ouvre,
               t.debut_impose       as "debutImpose",
               t.date_debut_reelle  as "dateDebutReelle",
               t.date_fin_reelle    as "dateFinReelle",
               (t.parent_id is not null) as feuille
          from tache t join lot l on l.id = t.lot_id
         where l.projet_id = ${projetId}
         order by t.code_wbs`),

    db.execute<LiaisonContexte>(sql`
        select li.tache_amont_id as amont, li.tache_aval_id as aval,
               li.type, li.decalage_j as decalage
          from liaison li
          join tache t on t.id = li.tache_aval_id
          join lot l on l.id = t.lot_id
         where l.projet_id = ${projetId}
         order by li.tache_amont_id, li.tache_aval_id`),

    db.execute<LigneContexte>(sql`
        select q.id, q.tache_id as "tacheId",
               q.quantite_prevue::float8 as "quantitePrevue",
               q.prix_unitaire_xof::float8 as "prixUnitaireXof"
          from ligne_quantitatif q
          join tache t on t.id = q.tache_id
          join lot l on l.id = t.lot_id
         where l.projet_id = ${projetId}
         order by t.code_wbs, q.designation, q.quantite_prevue, q.id`),

    db.execute<QuantiteJournaliere>(sql`
        select rq.ligne_quantitatif_id as "ligneId", r.date,
               sum(rq.quantite_realisee)::float8 as quantite
          from releve_quantite rq
          join releve_journalier r on r.id = rq.releve_journalier_id
         where r.projet_id = ${projetId} and r.statut = 'VALIDE'
         group by 1, 2
         order by 2, 1`),

    db.execute<MoyensJournaliers>(sql`
        select rj.lot_id as "lotId", rj.date,
               rj.heures_travaillees::float8 as "heuresOuvrier",
               rj.effectif_encadrement       as encadrement,
               rj.journee_travaillee         as "journeeTravaillee",
               coalesce((
                 select sum(case r.unite_cout
                              when 'HEURE' then e.heures * r.cout_unitaire_xof
                              when 'JOUR' then e.heures / ${COUT.heuresParJour}
                                               * r.cout_unitaire_xof
                              else 0 end)
                   from releve_engin e join ressource r on r.id = e.ressource_id
                  where e.releve_journalier_id = rj.id and not r.dans_frais_chantier
               ), 0)::float8 as "coutEnginsXof"
          from releve_journalier rj
         where rj.projet_id = ${projetId} and rj.statut = 'VALIDE'
         order by rj.date, rj.lot_id`),

    db.execute<AleaContexte>(sql`
        select lot_id as "lotId", date, impact_cout_xof::float8 as "coutXof"
          from alea where projet_id = ${projetId} order by date, id`),

    db.execute<JalonContexte>(sql`
        select id, nom, tache_declenchante_id as "tacheDeclenchanteId",
               contractuel,
               date_prevue as "datePrevue", date_reelle as "dateReelle"
          from jalon where projet_id = ${projetId} order by ordre`),

    // Un ouvrier est une personne entiere : l'effectif d'une equipe affectee
    // est arrondi, comme il l'est sur le chantier.
    db.execute<EquipePrevue>(sql`
        select a.tache_id as "tacheId", t.lot_id as "lotId",
               round(a.quantite * r.capacite)::int as ouvriers,
               a.date_debut as "dateDebut", a.date_fin as "dateFin"
          from affectation a
          join ressource r on r.id = a.ressource_id
          join tache t on t.id = a.tache_id
          join lot l on l.id = t.lot_id
         where l.projet_id = ${projetId} and r.type = 'EQUIPE'
         order by a.id`),

    db.execute<{ tacheId: string; debut: string; duree: number; ouvre: boolean }>(sql`
        select rt.tache_id as "tacheId", rt.date_debut as debut, rt.duree_j as duree,
               rt.calendrier = 'OUVRE' as ouvre
          from reference_tache rt
          join reference_planning rp on rp.id = rt.reference_id
         where rp.projet_id = ${projetId} and rp.active
         order by rt.tache_id`),

    // Une ressource louee a la journee coute sa journee pleine par unite
    // affectee ; une ressource a l'heure, une journee de travail.
    db.execute<EnginPrevu>(sql`
        select t.lot_id as "lotId",
               sum(a.quantite * (a.date_fin - a.date_debut + 1)
                   * case r.unite_cout
                       when 'JOUR' then r.cout_unitaire_xof
                       when 'HEURE' then ${COUT.heuresParJour} * r.cout_unitaire_xof
                       else 0 end)::float8 as "coutXof"
          from affectation a
          join ressource r on r.id = a.ressource_id
          join tache t on t.id = a.tache_id
          join lot l on l.id = t.lot_id
         where l.projet_id = ${projetId} and r.type in ('ENGIN', 'MATERIEL')
           and not r.dans_frais_chantier
         group by t.lot_id
         order by t.lot_id`),
  ])

  const projet = projets[0]
  if (!projet) throw new Error(`Projet introuvable : ${projetId}.`)

  return {
    projet,
    lots: [...lots],
    taches: [...taches],
    liaisons: [...liaisons],
    lignes: [...lignes],
    quantites: [...quantites],
    moyens: [...moyens],
    aleas: [...aleas],
    jalons: [...jalons],
    equipes: [...equipes],
    enginsPrevus: [...enginsPrevus],
    reference: new Map(
      reference.map((r) => [r.tacheId, { debut: r.debut, duree: r.duree, ouvre: r.ouvre }]),
    ),
  }
}

/** Identifiant du projet unique, pratique tant que l'application n'en gere qu'un. */
export async function premierProjetId(db: Db): Promise<string> {
  const lignes = await db.execute<{ id: string }>(sql`select id from projet order by code limit 1`)
  const premier = lignes[0]
  if (!premier) throw new Error('Aucun projet en base. Lancer npm run db:seed.')
  return premier.id
}
