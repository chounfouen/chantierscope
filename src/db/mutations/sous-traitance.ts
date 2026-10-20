/**
 * Ecritures de la sous-traitance et du registre de securite.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { poserAuteur } from '@/db/mutations/releve'
import type { TypeEvenementSecurite } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]

export type DemandeAgrement = {
  raisonSociale: string
  specialite: string
  montantXof: number
  paiementDirect: boolean
  demandeLe: string
  lotIds: string[]
}

/** Les lots designes appartiennent-ils tous au projet ? */
async function exigerLots(tx: Transaction, projetId: string, lotIds: string[]): Promise<void> {
  if (lotIds.length === 0) return
  const [r] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from lot
     where projet_id = ${projetId}::uuid
       and id in (${sql.join(
         lotIds.map((id) => sql`${id}::uuid`),
         sql`, `,
       )})`)
  if (Number(r?.n) !== new Set(lotIds).size) {
    throw new RefusMetier('INCOHERENT', 'Un lot désigné n’appartient pas à ce projet.')
  }
}

export async function demanderAgrement(
  db: Db,
  projetId: string,
  d: DemandeAgrement,
  auteurId: string,
): Promise<{ id: string }> {
  if (d.lotIds.length === 0) {
    throw new RefusMetier('INCOHERENT', 'Un sous-traitant exécute au moins un lot.')
  }
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await exigerLots(tx, projetId, d.lotIds)
    const pris = await tx.execute<{ nom: string; st: string }>(sql`
      select l.nom, s.raison_sociale as st from sous_traitant_lot sl
        join lot l on l.id = sl.lot_id join sous_traitant s on s.id = sl.sous_traitant_id
       where s.statut <> 'REFUSE' and sl.lot_id in (${sql.join(
         d.lotIds.map((id) => sql`${id}::uuid`),
         sql`, `,
       )})`)
    if (pris[0]) {
      throw new RefusMetier('INCOHERENT', `Le lot ${pris[0].nom} est déjà confié à ${pris[0].st}.`)
    }
    const doublon = await tx.execute(sql`
      select 1 from sous_traitant
       where projet_id = ${projetId}::uuid and lower(raison_sociale) = lower(${d.raisonSociale})`)
    if (doublon.length > 0) {
      throw new RefusMetier('INCOHERENT', `${d.raisonSociale} est déjà déclaré sur ce projet.`)
    }
    const [st] = await tx.execute<{ id: string }>(sql`
      insert into sous_traitant (projet_id, raison_sociale, specialite, montant_xof,
                                 paiement_direct, demande_le, cree_par_id)
      values (${projetId}::uuid, ${d.raisonSociale}, ${d.specialite}, ${d.montantXof},
              ${d.paiementDirect}, ${d.demandeLe}::date, ${auteurId}::uuid)
      returning id`)
    const id = st?.id as string
    // Un lot repris d'un sous-traitant refuse lui est retire.
    await tx.execute(sql`
      delete from sous_traitant_lot sl using sous_traitant s
       where s.id = sl.sous_traitant_id and s.statut = 'REFUSE'
         and sl.lot_id in (${sql.join(
           d.lotIds.map((l) => sql`${l}::uuid`),
           sql`, `,
         )})`)
    for (const lotId of new Set(d.lotIds)) {
      await tx.execute(sql`
        insert into sous_traitant_lot (sous_traitant_id, lot_id) values (${id}::uuid, ${lotId}::uuid)`)
    }
    return { id }
  })
}

export async function statuerAgrement(
  db: Db,
  projetId: string,
  sousTraitantId: string,
  decision: 'AGREE' | 'REFUSE',
  date: string,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const lignes = await tx.execute<{ demande: string }>(sql`
      update sous_traitant set statut = ${decision}::statut_agrement, statue_le = ${date}::date
       where id = ${sousTraitantId}::uuid and projet_id = ${projetId}::uuid and statut = 'DEMANDE'
         and demande_le <= ${date}::date
       returning demande_le as demande`)
    if (lignes.length === 0) {
      throw new RefusMetier(
        'INCOHERENT',
        'Demande introuvable, déjà tranchée, ou décision antérieure à la demande.',
      )
    }
  })
}

export type EvenementSaisi = {
  date: string
  type: TypeEvenementSecurite
  lotId: string | null
  sousTraitantId: string | null
  description: string
  joursArret: number
  participants: number | null
}

export async function consignerEvenement(
  db: Db,
  projetId: string,
  e: EvenementSaisi,
  auteurId: string,
): Promise<{ id: string }> {
  if ((e.type === 'ACCIDENT_AVEC_ARRET') !== e.joursArret > 0) {
    throw new RefusMetier(
      'INCOHERENT',
      e.type === 'ACCIDENT_AVEC_ARRET'
        ? 'Un accident avec arrêt porte au moins un jour d’arrêt.'
        : 'Seul un accident avec arrêt porte des jours d’arrêt.',
    )
  }
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    if (e.lotId) await exigerLots(tx, projetId, [e.lotId])
    if (e.sousTraitantId) {
      const st = await tx.execute(sql`
        select 1 from sous_traitant
         where id = ${e.sousTraitantId}::uuid and projet_id = ${projetId}::uuid`)
      if (st.length === 0) throw new RefusMetier('INTROUVABLE', 'Sous-traitant introuvable.')
    }
    const [r] = await tx.execute<{ id: string }>(sql`
      insert into evenement_securite (projet_id, date, type, lot_id, sous_traitant_id,
                                      description, jours_arret, participants, cree_par_id)
      values (${projetId}::uuid, ${e.date}::date, ${e.type}::type_evenement_securite,
              ${e.lotId}::uuid, ${e.sousTraitantId}::uuid, ${e.description}, ${e.joursArret},
              ${e.participants}, ${auteurId}::uuid)
      returning id`)
    return { id: r?.id as string }
  })
}
