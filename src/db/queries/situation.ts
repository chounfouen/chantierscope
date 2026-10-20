/**
 * Lecture des situations mensuelles : un arrete par mois, de l'ordre de
 * service a la date d'etat, decompte par le noyau. Les mois deja presentes
 * ou acceptes sont lus dans les decomptes figes, et non recalcules.
 */

import { sql } from 'drizzle-orm'
import { retenueRestituable } from '@/db/compute/reception'
import {
  avanceXof,
  coefficientsDuMois,
  situations,
  type Arrete,
  type ClausesFinancieres,
  type DecompteFige,
  type Situation,
} from '@/db/compute/situation'
import type { db as instanceDb } from '@/db/index'
import { cadreA, chargerContrat } from '@/db/queries/contrat'

type Db = ReturnType<typeof instanceDb>

export type Revision = {
  /** Nul a prix fermes. */
  moisZero: string | null
  partieFixe: number
  indiceNom: string | null
  indices: { mois: string; valeur: number }[]
}

export type Decompte = {
  clauses: ClausesFinancieres
  avanceXof: number
  revision: Revision
  situations: Situation[]
  /** Date du dernier releve valide pris en compte, ou nul sans releve. */
  dateEtat: string | null
  /** Mois que l'entreprise peut presenter maintenant, s'il y en a un. */
  moisPresentable: string | null
}

type LigneFigee = DecompteFige & { mois: string }

export async function chargerSituations(
  db: Db,
  projetId: string,
  aujourdhui: string,
): Promise<Decompte> {
  const [projets, arretes, contrat, reception, indices, figes] = await Promise.all([
    db.execute<
      ClausesFinancieres & {
        moisZero: string | null
        partieFixe: number
        indiceNom: string | null
      }
    >(sql`
      select montant_marche_xof::float8 as "montantInitialXof",
             retenue_garantie_taux::float8 as "retenueGarantieTaux",
             avance_demarrage_taux::float8 as "avanceTaux",
             avance_remboursement_debut::float8 as "remboursementDebut",
             avance_remboursement_fin::float8 as "remboursementFin",
             taux_penalite_journaliere::float8 as "tauxPenaliteJournaliere",
             plafond_penalite::float8 as "plafondPenalite",
             to_char(mois_zero_revision, 'YYYY-MM') as "moisZero",
             revision_partie_fixe::float8 as "partieFixe",
             indice_revision_nom as "indiceNom"
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
    db.execute<{
      dateReception: string | null
      constateeLe: string | null
      leveeLe: string | null
    }>(sql`
      select p.date_reception::text as "dateReception", r.constatee_le::text as "constateeLe",
             r.levee_le::text as "leveeLe"
        from projet p left join reserve r on r.projet_id = p.id
       where p.id = ${projetId}::uuid`),
    db.execute<{ mois: string; valeur: number }>(sql`
      select to_char(mois, 'YYYY-MM') as mois, valeur::float8 as valeur
        from indice_revision where projet_id = ${projetId}::uuid order by mois`),
    db.execute<LigneFigee>(sql`
      select to_char(mois, 'YYYY-MM') as mois, statut::text as statut,
             travaux_xof::float8 as "travauxXof", revision_xof::float8 as "revisionXof",
             retenue_garantie_xof::float8 as "retenueGarantieXof",
             remboursement_avance_xof::float8 as "remboursementAvanceXof",
             penalites_xof::float8 as "penalitesXof", net_cumule_xof::float8 as "netCumuleXof",
             a_payer_xof::float8 as "aPayerXof"
        from decompte where projet_id = ${projetId}::uuid order by mois`),
  ])
  const projet = projets[0]
  if (!projet) throw new Error(`Projet introuvable : ${projetId}.`)
  const { moisZero, partieFixe, indiceNom, ...clauses } = projet
  const dateReception = reception[0]?.dateReception ?? null
  const reserves = reception.filter((r) => r.constateeLe !== null)

  const dateEtat = arretes.at(-1)?.date ?? null
  const finDeMois = (mois: string) => {
    const [a, m] = mois.split('-').map(Number) as [number, number]
    return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  }
  const coefficients = coefficientsDuMois({
    mois: arretes.map((a) => a.mois),
    partieFixe,
    moisZero,
    indices: new Map(indices.map((i) => [i.mois, i.valeur])),
  })
  const liste: Arrete[] = arretes.map((a) => {
    const cadre = cadreA(contrat, a.date)
    const c = coefficients.get(a.mois)
    return {
      ...a,
      montantMarcheXof: cadre.montantXof,
      finContractuelle: cadre.finContractuelle,
      provisoire: a.date < finDeMois(a.mois),
      coefficientRevision: c?.coefficient ?? 1,
      indiceProvisoire: c?.provisoire ?? false,
      retenueRestituee: retenueRestituable({
        dateReception,
        reservesOuvertes: reserves.filter(
          (r) => (r.constateeLe as string) <= a.date && (r.leveeLe === null || r.leveeLe > a.date),
        ).length,
        aujourdhui: a.date,
      }),
    }
  })

  const calcul = situations(
    clauses,
    liste,
    new Map(figes.map(({ mois, ...f }) => [mois, f] as const)),
  )
  // On presente les mois dans l'ordre, un mois acheve a la fois.
  const premierLibre = calcul.find((s) => s.statut === 'PROJETEE')
  const moisPresentable = premierLibre && !premierLibre.provisoire ? premierLibre.mois : null

  return {
    clauses,
    avanceXof: avanceXof(clauses),
    revision: { moisZero, partieFixe, indiceNom, indices: [...indices] },
    situations: calcul,
    dateEtat,
    moisPresentable,
  }
}
