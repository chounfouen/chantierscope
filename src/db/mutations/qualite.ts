/**
 * Ecritures de la qualite : essais du beton et fiches de non-conformite.
 */

import { sql } from 'drizzle-orm'
import { conformiteCoulage, type ConformiteCoulage } from '@/db/compute/beton'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { poserAuteur } from '@/db/mutations/releve'
import { verrouillerProjet } from '@/db/verrou'

type Db = ReturnType<typeof instanceDb>
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]

export type EssaisSaisis = {
  prelevement: number
  ageJ: number
  dateEcrasement: string
  resistancesMpa: number[]
  laboratoire: string | null
}

type CoulageLu = {
  id: string
  date: string
  classeBeton: string
  ouvrage: string
  lotId: string
  statut: string
}

async function lireCoulage(tx: Transaction, projetId: string, coulageId: string) {
  const [c] = await tx.execute<CoulageLu>(sql`
    select c.id, r.date::text as date, c.classe_beton as "classeBeton", c.ouvrage,
           r.lot_id as "lotId", r.statut::text as statut
      from releve_coulage c join releve_journalier r on r.id = c.releve_journalier_id
     where c.id = ${coulageId}::uuid and r.projet_id = ${projetId}::uuid`)
  if (!c) throw new RefusMetier('INTROUVABLE', 'Coulage introuvable.')
  return c
}

async function prochainNumero(tx: Transaction, projetId: string): Promise<number> {
  const [n] = await tx.execute<{ n: number }>(sql`
    select coalesce(max(numero), 0)::int + 1 as n from non_conformite
     where projet_id = ${projetId}::uuid`)
  return Number(n?.n)
}

/**
 * Reporte les resultats d'un prelevement. A 28 jours, la conformite est
 * jugee aussitot : un beton non conforme ouvre une fiche de non-conformite,
 * une seule par coulage, que le conducteur traitera.
 */
export async function enregistrerEssais(
  db: Db,
  projetId: string,
  coulageId: string,
  e: EssaisSaisis,
  auteurId: string,
): Promise<{ conformite: ConformiteCoulage; ficheOuverte: number | null }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verrouillerProjet(tx, projetId)
    const c = await lireCoulage(tx, projetId, coulageId)
    if (c.statut !== 'VALIDE') {
      throw new RefusMetier(
        'INCOHERENT',
        'Les essais se reportent sur le coulage d’un relevé validé.',
      )
    }
    const ecart =
      (Date.parse(`${e.dateEcrasement}T00:00:00Z`) - Date.parse(`${c.date}T00:00:00Z`)) / 86_400_000
    if (Math.abs(ecart - e.ageJ) > 2) {
      throw new RefusMetier(
        'INCOHERENT',
        `Un essai à ${e.ageJ} jours d’un béton coulé le ${c.date} s’écrase autour du ` +
          `${new Date(Date.parse(`${c.date}T00:00:00Z`) + e.ageJ * 86_400_000).toISOString().slice(0, 10)}.`,
      )
    }
    const deja = await tx.execute(sql`
      select 1 from essai_beton
       where coulage_id = ${coulageId}::uuid and prelevement = ${e.prelevement}
         and age_j = ${e.ageJ}`)
    if (deja.length > 0) {
      throw new RefusMetier(
        'INCOHERENT',
        `Le prélèvement n° ${e.prelevement} a déjà ses résultats à ${e.ageJ} jours.`,
      )
    }
    for (const r of e.resistancesMpa) {
      await tx.execute(sql`
        insert into essai_beton (coulage_id, prelevement, age_j, date_ecrasement,
                                 resistance_mpa, laboratoire, cree_par_id)
        values (${coulageId}::uuid, ${e.prelevement}, ${e.ageJ}, ${e.dateEcrasement}::date,
                ${r}, ${e.laboratoire}, ${auteurId}::uuid)`)
    }

    const eprouvettes = await tx.execute<{
      prelevement: number
      ageJ: number
      resistanceMpa: number
    }>(sql`
      select prelevement, age_j as "ageJ", resistance_mpa::float8 as "resistanceMpa"
        from essai_beton where coulage_id = ${coulageId}::uuid`)
    const conformite = conformiteCoulage({
      classeBeton: c.classeBeton,
      dateCoulage: c.date,
      eprouvettes: [...eprouvettes],
      aujourdhui: e.dateEcrasement,
    })

    let ficheOuverte: number | null = null
    if (conformite.etat === 'NON_CONFORME') {
      const existe = await tx.execute(sql`
        select 1 from non_conformite where coulage_id = ${coulageId}::uuid`)
      if (existe.length === 0) {
        ficheOuverte = await prochainNumero(tx, projetId)
        await tx.execute(sql`
          insert into non_conformite (projet_id, numero, date_constat, lot_id, coulage_id,
                                      titre, constat, gravite, cree_par_id)
          values (${projetId}::uuid, ${ficheOuverte}, ${e.dateEcrasement}::date,
                  ${c.lotId}::uuid, ${coulageId}::uuid,
                  ${`Résistance à 28 jours insuffisante : ${c.ouvrage}`},
                  ${
                    `Béton ${c.classeBeton} coulé le ${c.date}. ${conformite.motif} ` +
                    'Contrôle d’identité selon la NF EN 206, annexe B. Fiche ouverte ' +
                    'automatiquement à la saisie des résultats.'
                  },
                  3, ${auteurId}::uuid)`)
      }
    }
    return { conformite, ficheOuverte }
  })
}

export type FicheSaisie = {
  dateConstat: string
  lotId: string | null
  titre: string
  constat: string
  gravite: number
}

export async function ouvrirNonConformite(
  db: Db,
  projetId: string,
  f: FicheSaisie,
  auteurId: string,
): Promise<{ numero: number }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verrouillerProjet(tx, projetId)
    if (f.lotId) {
      const l = await tx.execute(sql`
        select 1 from lot where id = ${f.lotId}::uuid and projet_id = ${projetId}::uuid`)
      if (l.length === 0) throw new RefusMetier('INTROUVABLE', 'Lot introuvable.')
    }
    const numero = await prochainNumero(tx, projetId)
    await tx.execute(sql`
      insert into non_conformite (projet_id, numero, date_constat, lot_id, titre, constat,
                                  gravite, cree_par_id)
      values (${projetId}::uuid, ${numero}, ${f.dateConstat}::date, ${f.lotId}::uuid,
              ${f.titre}, ${f.constat}, ${f.gravite}, ${auteurId}::uuid)`)
    return { numero }
  })
}

export async function traiterNonConformite(
  db: Db,
  projetId: string,
  ficheId: string,
  t: { cause: string; action: string; date: string },
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const lignes = await tx.execute(sql`
      update non_conformite set cause = ${t.cause}, action = ${t.action},
                                traitee_le = ${t.date}::date, statut = 'TRAITEE'
       where id = ${ficheId}::uuid and projet_id = ${projetId}::uuid and statut = 'OUVERTE'
         and date_constat <= ${t.date}::date
       returning id`)
    if (lignes.length === 0) {
      throw new RefusMetier(
        'INCOHERENT',
        'Fiche introuvable, déjà traitée, ou traitement daté d’avant le constat.',
      )
    }
  })
}

export async function leverNonConformite(
  db: Db,
  projetId: string,
  ficheId: string,
  date: string,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const lignes = await tx.execute(sql`
      update non_conformite set statut = 'LEVEE', levee_le = ${date}::date,
                                levee_par_id = ${auteurId}::uuid
       where id = ${ficheId}::uuid and projet_id = ${projetId}::uuid and statut = 'TRAITEE'
         and traitee_le <= ${date}::date
       returning id`)
    if (lignes.length === 0) {
      throw new RefusMetier(
        'INCOHERENT',
        'Seule une fiche traitée se lève, à une date qui suit son traitement.',
      )
    }
  })
}
