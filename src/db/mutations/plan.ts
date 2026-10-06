/**
 * Ecritures du plan interactif : fond de plan d'un niveau, zones et
 * rattachement des taches aux zones.
 *
 * Les zones ne portent aucune donnee calculee : leur etat se deduit a chaque
 * affichage des taches rattachees. Il n'y a donc rien a recalculer apres une
 * ecriture, seulement le cache de lecture a invalider.
 *
 * Le journal d'audit trace les plans et les zones par declencheur.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { estViolationUnicite, RefusMetier } from '@/db/mutations/erreurs'
import { poserAuteur } from '@/db/mutations/releve'
import type { FormatPlan } from '@/db/schema'
import {
  cheminPolygone,
  GABARIT_SANS_PLAN,
  refusPolygone,
  remettreAEchelle,
  type Gabarit,
  type Point,
} from '@/lib/plan/zones'

type Db = ReturnType<typeof instanceDb>
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Gabarit d'un niveau : l'image de son plan, ou le repere historique. */
async function gabaritNiveau(tx: Transaction, projetId: string, niveau: number): Promise<Gabarit> {
  const [p] = await tx.execute<Gabarit>(sql`
    select largeur, hauteur from plan_niveau
     where projet_id = ${projetId}::uuid and niveau = ${niveau}`)
  return p ?? GABARIT_SANS_PLAN
}

/** Remet a l'echelle les zones d'un niveau, d'un gabarit a l'autre. */
async function remettreZones(
  tx: Transaction,
  projetId: string,
  niveau: number,
  de: Gabarit,
  vers: Gabarit,
): Promise<number> {
  if (de.largeur === vers.largeur && de.hauteur === vers.hauteur) return 0
  const zones = await tx.execute<{ id: string; pathSvg: string }>(sql`
    select id, path_svg as "pathSvg" from zone
     where projet_id = ${projetId}::uuid and niveau = ${niveau}`)
  for (const z of zones) {
    await tx.execute(sql`
      update zone set path_svg = ${remettreAEchelle(z.pathSvg, de, vers)} where id = ${z.id}::uuid`)
  }
  return zones.length
}

export type PlanAEnregistrer = {
  niveau: number
  chemin: string
  largeur: number
  hauteur: number
  octets: number
  formatSource: FormatPlan
  nomFichier: string
}

/**
 * Pose ou remplace le fond de plan d'un niveau. Les zones deja dessinees
 * suivent : remises a l'echelle de la nouvelle image, proportions gardees.
 */
export async function enregistrerPlan(
  db: Db,
  projetId: string,
  p: PlanAEnregistrer,
  auteurId: string,
): Promise<{ zonesRemisesAEchelle: number }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const ancien = await gabaritNiveau(tx, projetId, p.niveau)
    await tx.execute(sql`
      insert into plan_niveau (projet_id, niveau, chemin, largeur, hauteur, octets,
                               format_source, nom_fichier, importe_par)
      values (${projetId}::uuid, ${p.niveau}, ${p.chemin}, ${p.largeur}, ${p.hauteur}, ${p.octets},
              ${p.formatSource}, ${p.nomFichier}, ${auteurId}::uuid)
      on conflict (projet_id, niveau) do update set
        chemin = excluded.chemin, largeur = excluded.largeur, hauteur = excluded.hauteur,
        octets = excluded.octets, format_source = excluded.format_source,
        nom_fichier = excluded.nom_fichier, importe_par = excluded.importe_par,
        importe_le = now()`)
    const n = await remettreZones(tx, projetId, p.niveau, ancien, {
      largeur: p.largeur,
      hauteur: p.hauteur,
    })
    return { zonesRemisesAEchelle: n }
  })
}

/** Retire le fond de plan d'un niveau ; ses zones reviennent au repere historique. */
export async function retirerPlan(
  db: Db,
  projetId: string,
  niveau: number,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const ancien = await gabaritNiveau(tx, projetId, niveau)
    const supprimes = await tx.execute(sql`
      delete from plan_niveau where projet_id = ${projetId}::uuid and niveau = ${niveau}
      returning id`)
    if (supprimes.length === 0) throw new RefusMetier('INTROUVABLE', 'Aucun plan sur ce niveau.')
    await remettreZones(tx, projetId, niveau, ancien, GABARIT_SANS_PLAN)
  })
}

export type ZoneAEnregistrer = {
  /** Absent a la creation. */
  id?: string | undefined
  nom: string
  niveau: number
  points: Point[]
  tacheIds: string[]
}

/** Cree ou modifie une zone, contour et taches rattachees compris. */
export async function enregistrerZone(
  db: Db,
  projetId: string,
  z: ZoneAEnregistrer,
  auteurId: string,
): Promise<{ id: string }> {
  try {
    return await db.transaction(async (tx) => {
      await poserAuteur(tx, auteurId)
      const refus = refusPolygone(z.points, await gabaritNiveau(tx, projetId, z.niveau))
      if (refus) throw new RefusMetier('INCOHERENT', refus)

      const ids = [...new Set(z.tacheIds)]
      const valides = await tachesDuProjet(tx, projetId, ids)
      if (valides !== ids.length) {
        throw new RefusMetier(
          'INCOHERENT',
          'Seules les tâches élémentaires de ce chantier se rattachent à une zone.',
        )
      }

      const chemin = cheminPolygone(z.points)
      let id = z.id
      if (id) {
        const maj = await tx.execute(sql`
          update zone set nom = ${z.nom}, niveau = ${z.niveau}, path_svg = ${chemin}
           where id = ${id}::uuid and projet_id = ${projetId}::uuid returning id`)
        if (maj.length === 0) throw new RefusMetier('INTROUVABLE', 'Zone introuvable.')
      } else {
        const [creee] = await tx.execute<{ id: string }>(sql`
          insert into zone (projet_id, nom, niveau, path_svg)
          values (${projetId}::uuid, ${z.nom}, ${z.niveau}, ${chemin}) returning id`)
        id = creee?.id as string
      }
      await tx.execute(sql`delete from zone_tache where zone_id = ${id}::uuid`)
      for (const t of ids) {
        await tx.execute(
          sql`insert into zone_tache (zone_id, tache_id) values (${id}::uuid, ${t}::uuid)`,
        )
      }
      return { id }
    })
  } catch (e) {
    if (estViolationUnicite(e)) {
      throw new RefusMetier('CONFLIT', `Une zone s’appelle déjà « ${z.nom} » sur ce chantier.`)
    }
    throw e
  }
}

/** Nombre de taches elementaires du projet parmi celles proposees. */
async function tachesDuProjet(tx: Transaction, projetId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const [r] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from tache t join lot l on l.id = t.lot_id
     where l.projet_id = ${projetId}::uuid
       and not exists (select 1 from tache e where e.parent_id = t.id)
       and t.id in (${sql.join(
         ids.map((i) => sql`${i}::uuid`),
         sql`, `,
       )})`)
  return r?.n ?? 0
}

export async function supprimerZone(
  db: Db,
  projetId: string,
  zoneId: string,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const r = await tx.execute(sql`
      delete from zone where id = ${zoneId}::uuid and projet_id = ${projetId}::uuid returning id`)
    if (r.length === 0) throw new RefusMetier('INTROUVABLE', 'Zone introuvable.')
  })
}
