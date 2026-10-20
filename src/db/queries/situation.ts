/**
 * Lecture des situations mensuelles : un arrete par mois, de l'ordre de
 * service a la date d'etat, decompte par le noyau.
 */

import { sql } from 'drizzle-orm'
import {
  avanceXof,
  situations,
  type Arrete,
  type ClausesFinancieres,
  type Situation,
} from '@/db/compute/situation'
import type { db as instanceDb } from '@/db/index'
import { cadreA, chargerContrat } from '@/db/queries/contrat'

type Db = ReturnType<typeof instanceDb>

export type Decompte = {
  clauses: ClausesFinancieres
  avanceXof: number
  situations: Situation[]
  /** Date du dernier releve valide pris en compte, ou nul sans releve. */
  dateEtat: string | null
}

export async function chargerSituations(
  db: Db,
  projetId: string,
  aujourdhui: string,
): Promise<Decompte> {
  const [projets, arretes, contrat] = await Promise.all([
    db.execute<Omit<ClausesFinancieres, 'montantInitialXof'> & { montantInitialXof: number }>(sql`
      select montant_marche_xof::float8 as "montantInitialXof",
             retenue_garantie_taux::float8 as "retenueGarantieTaux",
             avance_demarrage_taux::float8 as "avanceTaux",
             avance_remboursement_debut::float8 as "remboursementDebut",
             avance_remboursement_fin::float8 as "remboursementFin",
             taux_penalite_journaliere::float8 as "tauxPenaliteJournaliere",
             plafond_penalite::float8 as "plafondPenalite"
        from projet where id = ${projetId}::uuid`),
    // Le dernier instantane de chaque mois : la fin du mois, ou la date
    // d'etat pour le mois en cours.
    db.execute<{ mois: string; date: string; travauxXof: number }>(sql`
      select distinct on (date_trunc('month', date))
             to_char(date, 'YYYY-MM') as mois, date::text as date,
             valeur_acquise_xof::float8 as "travauxXof"
        from snapshot_avancement
       where projet_id = ${projetId}::uuid and lot_id is null
       order by date_trunc('month', date), date desc`),
    chargerContrat(db, projetId, aujourdhui),
  ])
  const clauses = projets[0]
  if (!clauses) throw new Error(`Projet introuvable : ${projetId}.`)

  const dateEtat = arretes.at(-1)?.date ?? null
  const finDeMois = (mois: string) => {
    const [a, m] = mois.split('-').map(Number) as [number, number]
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  }
  const liste: Arrete[] = arretes.map((a) => {
    const cadre = cadreA(contrat, a.date)
    return {
      ...a,
      montantMarcheXof: cadre.montantXof,
      finContractuelle: cadre.finContractuelle,
      provisoire: a.date < finDeMois(a.mois),
    }
  })

  return {
    clauses,
    avanceXof: avanceXof(clauses),
    situations: situations(clauses, liste),
    dateEtat,
  }
}
