/**
 * Ecritures de la reception : reserves et prononce de la reception.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { poserAuteur } from '@/db/mutations/releve'
import type { PhaseReserve } from '@/db/schema'
import { verrouillerProjet } from '@/db/verrou'

type Db = ReturnType<typeof instanceDb>

export type ReserveSaisie = {
  phase: PhaseReserve
  zoneId: string | null
  lotId: string | null
  description: string
  constateeLe: string
  echeance: string | null
}

export async function constaterReserve(
  db: Db,
  projetId: string,
  r: ReserveSaisie,
  auteurId: string,
): Promise<{ numero: number }> {
  if (r.echeance !== null && r.echeance < r.constateeLe) {
    throw new RefusMetier('INCOHERENT', 'L’échéance de levée suit le constat.')
  }
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verrouillerProjet(tx, projetId)
    if (r.zoneId) {
      const z = await tx.execute(sql`
        select 1 from zone where id = ${r.zoneId}::uuid and projet_id = ${projetId}::uuid`)
      if (z.length === 0) throw new RefusMetier('INTROUVABLE', 'Zone introuvable.')
    }
    if (r.lotId) {
      const l = await tx.execute(sql`
        select 1 from lot where id = ${r.lotId}::uuid and projet_id = ${projetId}::uuid`)
      if (l.length === 0) throw new RefusMetier('INTROUVABLE', 'Lot introuvable.')
    }
    if (r.phase === 'PARFAIT_ACHEVEMENT') {
      const [p] = await tx.execute<{ reception: string | null }>(sql`
        select date_reception::text as reception from projet where id = ${projetId}::uuid`)
      if (!p?.reception || p.reception > r.constateeLe) {
        throw new RefusMetier(
          'INCOHERENT',
          'Une réserve de parfait achèvement suit la réception prononcée.',
        )
      }
    }
    const [n] = await tx.execute<{ n: number }>(sql`
      select coalesce(max(numero), 0)::int + 1 as n from reserve
       where projet_id = ${projetId}::uuid`)
    const numero = Number(n?.n)
    await tx.execute(sql`
      insert into reserve (projet_id, numero, phase, zone_id, lot_id, description,
                           constatee_le, echeance, cree_par_id)
      values (${projetId}::uuid, ${numero}, ${r.phase}::phase_reserve, ${r.zoneId}::uuid,
              ${r.lotId}::uuid, ${r.description}, ${r.constateeLe}::date, ${r.echeance}::date,
              ${auteurId}::uuid)`)
    return { numero }
  })
}

export async function leverReserve(
  db: Db,
  projetId: string,
  reserveId: string,
  date: string,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const lignes = await tx.execute(sql`
      update reserve set levee_le = ${date}::date, levee_par_id = ${auteurId}::uuid
       where id = ${reserveId}::uuid and projet_id = ${projetId}::uuid and levee_le is null
         and constatee_le <= ${date}::date
       returning id`)
    if (lignes.length === 0) {
      throw new RefusMetier(
        'INCOHERENT',
        'Réserve introuvable, déjà levée, ou levée datée d’avant le constat.',
      )
    }
  })
}

/**
 * Prononce la reception, une seule fois. Les reserves deja constatees aux
 * operations prealables restent ouvertes : la reception est prononcee avec
 * reserves, que l'entreprise leve ensuite.
 */
export async function prononcerReception(
  db: Db,
  projetId: string,
  date: string,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const lignes = await tx.execute(sql`
      update projet set date_reception = ${date}::date
       where id = ${projetId}::uuid and date_reception is null
         and date_ordre_service <= ${date}::date
       returning id`)
    if (lignes.length === 0) {
      throw new RefusMetier(
        'INCOHERENT',
        'La réception est déjà prononcée, ou la date précède le démarrage.',
      )
    }
  })
}
