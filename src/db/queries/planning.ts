/**
 * Lecture du planning d'un projet : taches, liaisons, jalons, arrets.
 *
 * Une seule lecture alimente le Gantt, l'edition du planning et la
 * simulation. Les dates au plus tot et au plus tard ne sont pas stockees :
 * elles se recalculent en quelques millisecondes depuis le reseau, ce qui
 * garantit qu'elles correspondent toujours aux durees et liaisons affichees.
 *
 * Le budget et la valeur acquise d'une tache sont des montants au prix du
 * marche, que le maitre d'ouvrage connait ; aucune donnee interne n'y figure.
 */

import { sql } from 'drizzle-orm'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { db as instanceDb } from '@/db/index'
import type { Reseau } from '@/db/compute/types'
import type { TypeLiaison } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

export type TachePlanning = {
  id: string
  lotId: string
  parentId: string | null
  codeWbs: string
  nom: string
  feuille: boolean
  dateDebutPrevue: string
  dateFinPrevue: string
  dureePrevueJ: number
  debutImpose: string | null
  dateDebutReelle: string | null
  dateFinReelle: string | null
  avancement: number
  budgetXof: number
  margeTotaleJ: number | null
  margeLibreJ: number | null
  critique: boolean
}

export type LiaisonPlanning = {
  id: string
  amontId: string
  avalId: string
  type: TypeLiaison
  decalageJ: number
}

export type JalonPlanning = {
  id: string
  nom: string
  contractuel: boolean
  datePrevue: string
  dateReelle: string | null
  tacheDeclenchanteId: string | null
}

export type Planning = {
  projet: {
    id: string
    code: string
    nom: string
    dateOrdreService: string
    dateFinContractuelle: string
    dureeContractuelleJ: number
    montantMarcheXof: number
    tauxPenaliteJournaliere: number
  }
  lots: { id: string; code: string; nom: string; rangCouleur: number }[]
  taches: TachePlanning[]
  liaisons: LiaisonPlanning[]
  jalons: JalonPlanning[]
  /** Journees d'arret constatees par les releves valides, avec leur cause. */
  arrets: { date: string; cause: string }[]
}

export async function chargerPlanning(db: Db, projetId: string): Promise<Planning> {
  const [projets, lots, taches, liaisons, jalons, arrets] = await Promise.all([
    db.execute<Planning['projet']>(sql`
      select id, code, nom,
             date_ordre_service as "dateOrdreService",
             date_fin_contractuelle as "dateFinContractuelle",
             duree_contractuelle_j as "dureeContractuelleJ",
             montant_marche_xof::float8 as "montantMarcheXof",
             taux_penalite_journaliere::float8 as "tauxPenaliteJournaliere"
        from projet where id = ${projetId}::uuid`),
    db.execute<Planning['lots'][number]>(sql`
      select id, code, nom, rang_couleur as "rangCouleur"
        from lot where projet_id = ${projetId}::uuid order by ordre`),
    db.execute<TachePlanning>(sql`
      select t.id, t.lot_id as "lotId", t.parent_id as "parentId", t.code_wbs as "codeWbs", t.nom,
             (t.parent_id is not null) as feuille,
             t.date_debut_prevue as "dateDebutPrevue", t.date_fin_prevue as "dateFinPrevue",
             t.duree_prevue_j as "dureePrevueJ", t.debut_impose as "debutImpose",
             t.date_debut_reelle as "dateDebutReelle", t.date_fin_reelle as "dateFinReelle",
             t.avancement_pct::float8 as avancement,
             t.poids_budgetaire_xof::float8 as "budgetXof",
             t.marge_totale_j as "margeTotaleJ", t.marge_libre_j as "margeLibreJ", t.critique
        from tache t join lot l on l.id = t.lot_id
       where l.projet_id = ${projetId}::uuid
       order by t.code_wbs`),
    db.execute<LiaisonPlanning>(sql`
      select li.id, li.tache_amont_id as "amontId", li.tache_aval_id as "avalId",
             li.type, li.decalage_j as "decalageJ"
        from liaison li
        join tache t on t.id = li.tache_amont_id
        join lot l on l.id = t.lot_id
       where l.projet_id = ${projetId}::uuid`),
    db.execute<JalonPlanning>(sql`
      select id, nom, contractuel, date_prevue as "datePrevue", date_reelle as "dateReelle",
             tache_declenchante_id as "tacheDeclenchanteId"
        from jalon where projet_id = ${projetId}::uuid order by ordre`),
    db.execute<{ date: string; cause: string }>(sql`
      select r.date, coalesce(r.motif_arret, 'Arrêt') || ' (lot ' || l.code || ')' as cause
        from releve_journalier r join lot l on l.id = r.lot_id
       where r.projet_id = ${projetId}::uuid and r.statut = 'VALIDE' and not r.journee_travaillee
       order by r.date, l.code`),
  ])

  const projet = projets[0]
  if (!projet) throw new Error(`Projet introuvable : ${projetId}.`)
  return {
    projet,
    lots: [...lots],
    taches: [...taches],
    liaisons: [...liaisons],
    jalons: [...jalons],
    arrets: [...arrets],
  }
}

/** Jour d'une date de planning, depuis l'ordre de service. */
export function jourDuPlanning(origine: string, date: string): number {
  return differenceInCalendarDays(parseISO(date), parseISO(origine))
}

/** Reseau de calcul du planning : taches feuilles, durees, contraintes, liaisons. */
export function reseauDuPlanning(p: Pick<Planning, 'projet' | 'taches' | 'liaisons'>): Reseau {
  const origine = p.projet.dateOrdreService
  return {
    taches: p.taches
      .filter((t) => t.feuille)
      .map((t) => ({
        id: t.id,
        duree: t.dureePrevueJ,
        ...(t.debutImpose !== null ? { debutImpose: jourDuPlanning(origine, t.debutImpose) } : {}),
      })),
    liaisons: p.liaisons.map((l) => ({
      amont: l.amontId,
      aval: l.avalId,
      type: l.type,
      decalage: l.decalageJ,
    })),
  }
}

export type ScenarioEnregistre = {
  id: string
  nom: string
  description: string | null
  perturbations: { tacheId: string; decalageJ: number; allongementJ: number }[]
  auteur: string | null
  creeLe: Date
}

export async function chargerScenarios(db: Db, projetId: string): Promise<ScenarioEnregistre[]> {
  const lignes = await db.execute<ScenarioEnregistre>(sql`
    select s.id, s.nom, s.description, s.perturbations, u.nom as auteur, s.cree_le as "creeLe"
      from scenario_simulation s left join utilisateur u on u.id = s.cree_par_id
     where s.projet_id = ${projetId}::uuid
     order by s.cree_le desc`)
  return [...lignes]
}
