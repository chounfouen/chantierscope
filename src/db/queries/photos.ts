/**
 * Lecture de la timeline photographique.
 *
 * Le lot d'une photo est celui de sa tache, a defaut celui du releve depuis
 * lequel elle a ete prise. La date est celle de la prise de vue, en temps
 * universel, qui est l'heure d'Abidjan.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'

type Db = ReturnType<typeof instanceDb>

export type PhotoLue = {
  id: string
  date: string
  pointDeVueId: string | null
  lotId: string | null
  legende: string | null
  chemin: string
  cheminVignette: string
  largeur: number | null
  hauteur: number | null
}

export type DonneesPhotos = {
  photos: PhotoLue[]
  pointsDeVue: { id: string; nom: string }[]
  lots: { id: string; code: string; nom: string }[]
}

export async function chargerPhotos(db: Db, projetId: string): Promise<DonneesPhotos> {
  const [photos, pointsDeVue, lots] = await Promise.all([
    db.execute<PhotoLue>(sql`
      select p.id, (p.prise_le at time zone 'UTC')::date::text as date,
             p.point_de_vue_id as "pointDeVueId",
             coalesce(t.lot_id, r.lot_id) as "lotId",
             p.legende, p.chemin, p.chemin_vignette as "cheminVignette",
             p.largeur, p.hauteur
        from photo p
        left join tache t on t.id = p.tache_id
        left join releve_journalier r on r.id = p.releve_journalier_id
       where p.projet_id = ${projetId}
       order by p.prise_le, p.id`),
    db.execute<{ id: string; nom: string }>(sql`
      select id, nom from point_de_vue where projet_id = ${projetId} order by nom`),
    db.execute<{ id: string; code: string; nom: string }>(sql`
      select id, code, nom from lot where projet_id = ${projetId} order by ordre`),
  ])
  return { photos: [...photos], pointsDeVue: [...pointsDeVue], lots: [...lots] }
}
