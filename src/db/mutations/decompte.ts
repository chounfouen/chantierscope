/**
 * Presentation et acceptation des decomptes mensuels.
 *
 * Presenter fige les montants de la situation du mois, tels que le noyau les
 * calcule a cet instant. Accepter les rend definitifs : la base refuse
 * ensuite toute modification. Un decompte presente peut etre rejete par le
 * maitre d'oeuvre, et l'entreprise le presente a nouveau.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { poserAuteur } from '@/db/mutations/releve'
import { chargerSituations } from '@/db/queries/situation'
import { verrouillerProjet } from '@/db/verrou'

type Db = ReturnType<typeof instanceDb>

export async function presenterDecompte(
  db: Db,
  projetId: string,
  mois: string,
  aujourdhui: string,
  auteurId: string,
): Promise<{ numero: number; aPayerXof: number }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verrouillerProjet(tx, projetId)
    const d = await chargerSituations(tx as unknown as Db, projetId, aujourdhui)
    if (d.moisPresentable !== mois) {
      throw new RefusMetier(
        'INCOHERENT',
        d.moisPresentable === null
          ? 'Aucun mois achevé n’attend sa présentation.'
          : `Les situations se présentent dans l’ordre : d’abord ${d.moisPresentable}.`,
      )
    }
    const s = d.situations.find((x) => x.mois === mois)
    if (!s) throw new RefusMetier('INTROUVABLE', 'Situation introuvable.')
    await tx.execute(sql`
      insert into decompte (projet_id, numero, mois, date_arrete, travaux_xof, revision_xof,
                            retenue_garantie_xof, remboursement_avance_xof, penalites_xof,
                            net_cumule_xof, a_payer_xof, presente_le, presente_par_id)
      values (${projetId}::uuid, ${s.numero}, ${`${mois}-01`}::date, ${s.date}::date,
              ${s.travauxXof}, ${s.revisionXof}, ${s.retenueGarantieXof},
              ${s.remboursementAvanceXof}, ${s.penalitesXof}, ${s.netCumuleXof}, ${s.aPayerXof},
              ${aujourdhui}::date, ${auteurId}::uuid)`)
    return { numero: s.numero, aPayerXof: s.aPayerXof }
  })
}

export async function statuerDecompte(
  db: Db,
  projetId: string,
  mois: string,
  decision: 'ACCEPTEE' | 'REJETEE',
  aujourdhui: string,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verrouillerProjet(tx, projetId)
    const [anterieur] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from decompte
       where projet_id = ${projetId}::uuid and statut = 'PRESENTEE'
         and mois < ${`${mois}-01`}::date`)
    if (Number(anterieur?.n) > 0) {
      throw new RefusMetier('INCOHERENT', 'Un décompte antérieur attend encore sa décision.')
    }
    const lignes =
      decision === 'ACCEPTEE'
        ? await tx.execute(sql`
            update decompte set statut = 'ACCEPTEE', accepte_le = ${aujourdhui}::date,
                                accepte_par_id = ${auteurId}::uuid
             where projet_id = ${projetId}::uuid and mois = ${`${mois}-01`}::date
               and statut = 'PRESENTEE'
             returning id`)
        : await tx.execute(sql`
            delete from decompte
             where projet_id = ${projetId}::uuid and mois = ${`${mois}-01`}::date
               and statut = 'PRESENTEE'
               and not exists (select 1 from decompte d2 where d2.projet_id = ${projetId}::uuid
                                  and d2.mois > ${`${mois}-01`}::date)
             returning id`)
    if (lignes.length === 0) {
      throw new RefusMetier('INCOHERENT', 'Aucun décompte présenté pour ce mois.')
    }
  })
}
