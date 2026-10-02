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
  /** Contrainte « pas avant » posee a la main, nulle sinon. */
  debutImpose: string | null
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
}

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
}

/* -------------------------------------------------------------------------- */
/* Chargement                                                                 */
/* -------------------------------------------------------------------------- */

export async function chargerContexte(db: Db, projetId: string): Promise<Contexte> {
  const [projets, lots, taches, liaisons, lignes, quantites, moyens, aleas, jalons, equipes] =
    await Promise.all([
      db.execute<ProjetContexte>(sql`
        select id, code, nom,
               date_ordre_service      as "dateOrdreService",
               date_fin_contractuelle  as "dateFinContractuelle",
               duree_contractuelle_j   as "dureeContractuelleJ",
               montant_marche_xof::float8      as "montantMarcheXof",
               taux_penalite_journaliere::float8 as "tauxPenaliteJournaliere"
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
               t.debut_impose       as "debutImpose",
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
         where l.projet_id = ${projetId}`),

      db.execute<LigneContexte>(sql`
        select q.id, q.tache_id as "tacheId",
               q.quantite_prevue::float8 as "quantitePrevue",
               q.prix_unitaire_xof::float8 as "prixUnitaireXof"
          from ligne_quantitatif q
          join tache t on t.id = q.tache_id
          join lot l on l.id = t.lot_id
         where l.projet_id = ${projetId}`),

      db.execute<QuantiteJournaliere>(sql`
        select rq.ligne_quantitatif_id as "ligneId", r.date,
               sum(rq.quantite_realisee)::float8 as quantite
          from releve_quantite rq
          join releve_journalier r on r.id = rq.releve_journalier_id
         where r.projet_id = ${projetId} and r.statut = 'VALIDE'
         group by 1, 2
         order by 2`),

      db.execute<MoyensJournaliers>(sql`
        select lot_id as "lotId", date,
               heures_travaillees::float8 as "heuresOuvrier",
               effectif_encadrement       as encadrement,
               journee_travaillee         as "journeeTravaillee"
          from releve_journalier
         where projet_id = ${projetId} and statut = 'VALIDE'
         order by date`),

      db.execute<AleaContexte>(sql`
        select lot_id as "lotId", date, impact_cout_xof::float8 as "coutXof"
          from alea where projet_id = ${projetId} order by date`),

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
         where l.projet_id = ${projetId} and r.type = 'EQUIPE'`),
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
  }
}

/** Identifiant du projet unique, pratique tant que l'application n'en gere qu'un. */
export async function premierProjetId(db: Db): Promise<string> {
  const lignes = await db.execute<{ id: string }>(sql`select id from projet order by code limit 1`)
  const premier = lignes[0]
  if (!premier) throw new Error('Aucun projet en base. Lancer npm run db:seed.')
  return premier.id
}
