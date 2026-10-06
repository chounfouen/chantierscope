/**
 * Ecritures de la maquette : import, retrait, regles de rattachement.
 *
 * Comme les zones du plan, la maquette ne porte aucune donnee calculee :
 * l'etat de chaque element se deduit a l'affichage des taches rattachees.
 * Rien a recalculer apres une ecriture, seulement le cache a invalider.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { poserAuteur } from '@/db/mutations/releve'
import type { FamilleOuvrage } from '@/db/schema'
import type { ElementMaquette, Etage } from '@/lib/maquette/ifc'

type Db = ReturnType<typeof instanceDb>

export type MaquetteAEnregistrer = {
  chemin: string
  octets: number
  nomFichier: string
  schemaIfc: string
  etages: Etage[]
  elements: ElementMaquette[]
}

/** Par paquets : une maquette compte jusqu'a des dizaines de milliers d'elements. */
const PAQUET = 1000

/**
 * Pose ou remplace la maquette du projet. Son inventaire est reecrit en
 * entier ; les regles, attachees au projet, sont gardees et s'appliquent
 * aussitot a la nouvelle version.
 */
export async function enregistrerMaquette(
  db: Db,
  projetId: string,
  m: MaquetteAEnregistrer,
  auteurId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const [maq] = await tx.execute<{ id: string }>(sql`
      insert into maquette (projet_id, chemin, octets, nom_fichier, schema_ifc, etages, importe_par)
      values (${projetId}::uuid, ${m.chemin}, ${m.octets}, ${m.nomFichier}, ${m.schemaIfc},
              ${JSON.stringify(m.etages)}::jsonb, ${auteurId}::uuid)
      on conflict (projet_id) do update set
        chemin = excluded.chemin, octets = excluded.octets, nom_fichier = excluded.nom_fichier,
        schema_ifc = excluded.schema_ifc, etages = excluded.etages,
        importe_par = excluded.importe_par, importe_le = now()
      returning id`)
    const id = maq?.id as string
    await tx.execute(sql`delete from element_maquette where maquette_id = ${id}::uuid`)
    for (let i = 0; i < m.elements.length; i += PAQUET) {
      const lignes = m.elements
        .slice(i, i + PAQUET)
        .map((e) => sql`(${id}::uuid, ${e.globalId}, ${e.classe}, ${e.nom}, ${e.etage})`)
      await tx.execute(sql`
        insert into element_maquette (maquette_id, global_id, classe, nom, etage)
        values ${sql.join(lignes, sql`, `)}
        on conflict do nothing`)
    }
    return { id }
  })
}

export async function retirerMaquette(db: Db, projetId: string, auteurId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const r = await tx.execute(sql`
      delete from maquette where projet_id = ${projetId}::uuid returning id`)
    if (r.length === 0) throw new RefusMetier('INTROUVABLE', 'Aucune maquette pour ce chantier.')
  })
}

export type RegleAEnregistrer = {
  tacheId: string
  famille: FamilleOuvrage
  niveau: number | null
  nomContient: string | null
}

/** Ajoute des regles ; une regle deja presente est ignoree. Rend le nombre ajoute. */
export async function ajouterRegles(
  db: Db,
  projetId: string,
  regles: readonly RegleAEnregistrer[],
  auteurId: string,
): Promise<number> {
  if (regles.length === 0) return 0
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const ids = [...new Set(regles.map((r) => r.tacheId))]
    const [connues] = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from tache t join lot l on l.id = t.lot_id
       where l.projet_id = ${projetId}::uuid
         and not exists (select 1 from tache e where e.parent_id = t.id)
         and t.id in (${sql.join(
           ids.map((i) => sql`${i}::uuid`),
           sql`, `,
         )})`)
    if ((connues?.n ?? 0) !== ids.length) {
      throw new RefusMetier(
        'INCOHERENT',
        'Seules les tâches élémentaires de ce chantier se rattachent à la maquette.',
      )
    }
    const lignes = regles.map(
      (r) =>
        sql`(${projetId}::uuid, ${r.tacheId}::uuid, ${r.famille}::famille_ouvrage, ${r.niveau}::smallint, ${r.nomContient?.trim() || null})`,
    )
    const ajoutees = await tx.execute(sql`
      insert into regle_maquette (projet_id, tache_id, famille, niveau, nom_contient)
      values ${sql.join(lignes, sql`, `)}
      on conflict do nothing
      returning id`)
    return ajoutees.length
  })
}

export async function supprimerRegle(
  db: Db,
  projetId: string,
  regleId: string,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const r = await tx.execute(sql`
      delete from regle_maquette where id = ${regleId}::uuid and projet_id = ${projetId}::uuid
      returning id`)
    if (r.length === 0) throw new RefusMetier('INTROUVABLE', 'Rattachement introuvable.')
  })
}
