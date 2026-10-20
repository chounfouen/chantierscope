/** Lecture des reserves et de la reception. */

import { sql } from 'drizzle-orm'
import { finGarantie, syntheseReserves, type SyntheseReserves } from '@/db/compute/reception'
import type { db as instanceDb } from '@/db/index'
import type { PhaseReserve } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

export type ReserveLue = {
  id: string
  numero: number
  phase: PhaseReserve
  zoneId: string | null
  zoneNom: string | null
  niveau: number | null
  lotNom: string | null
  /** Entreprise qui execute le lot : sous-traitant agree, ou le titulaire. */
  entreprise: string | null
  description: string
  constateeLe: string
  echeance: string | null
  leveeLe: string | null
}

export type Reception = {
  reserves: ReserveLue[]
  synthese: SyntheseReserves
  dateReception: string | null
  finGarantie: string | null
}

export async function chargerReception(
  db: Db,
  projetId: string,
  aujourdhui: string,
): Promise<Reception> {
  const [reserves, projets] = await Promise.all([
    db.execute<ReserveLue>(sql`
      select r.id, r.numero, r.phase::text as phase, r.zone_id as "zoneId", z.nom as "zoneNom",
             z.niveau, l.nom as "lotNom",
             (select s.raison_sociale from sous_traitant_lot sl
                join sous_traitant s on s.id = sl.sous_traitant_id
               where sl.lot_id = r.lot_id and s.statut = 'AGREE') as entreprise,
             r.description, r.constatee_le::text as "constateeLe", r.echeance::text as echeance,
             r.levee_le::text as "leveeLe"
        from reserve r
        left join zone z on z.id = r.zone_id
        left join lot l on l.id = r.lot_id
       where r.projet_id = ${projetId}::uuid
       order by r.levee_le is not null, z.niveau nulls last, z.nom, r.numero`),
    db.execute<{ dateReception: string | null }>(sql`
      select date_reception::text as "dateReception" from projet where id = ${projetId}::uuid`),
  ])
  const dateReception = projets[0]?.dateReception ?? null
  return {
    reserves: [...reserves],
    synthese: syntheseReserves([...reserves], aujourdhui),
    dateReception,
    finGarantie: dateReception === null ? null : finGarantie(dateReception),
  }
}

/** Reserves ouvertes par zone, pour le plan. */
export async function reservesOuvertesParZone(
  db: Db,
  projetId: string,
): Promise<Record<string, number>> {
  const lignes = await db.execute<{ zoneId: string; n: number }>(sql`
    select zone_id as "zoneId", count(*)::int as n from reserve
     where projet_id = ${projetId}::uuid and zone_id is not null and levee_le is null
     group by zone_id`)
  return Object.fromEntries(lignes.map((l) => [l.zoneId, l.n]))
}

/** Zones du plan, pour localiser une reserve. */
export async function zonesDuProjet(
  db: Db,
  projetId: string,
): Promise<{ id: string; nom: string }[]> {
  const lignes = await db.execute<{ id: string; nom: string }>(sql`
    select id, nom from zone where projet_id = ${projetId}::uuid order by niveau, nom`)
  return [...lignes]
}
