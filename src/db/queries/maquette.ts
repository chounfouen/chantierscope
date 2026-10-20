/**
 * Lecture de la maquette : son inventaire d'elements, les regles de
 * rattachement et le suivi des taches rattachees, pour colorer chaque
 * element selon l'etat de ses taches et le rejouer dans le temps.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { chargerSuivi, type Suivi } from '@/db/queries/plan'
import type { FamilleOuvrage } from '@/db/schema'
import type { ElementMaquette, Etage } from '@/lib/maquette/ifc'

type Db = ReturnType<typeof instanceDb>

export type MaquetteLue = {
  id: string
  chemin: string
  octets: number
  nomFichier: string
  schemaIfc: string
  etages: Etage[]
  importeLe: string
}

export type RegleLue = {
  id: string
  tacheId: string
  codeWbs: string
  nomTache: string
  famille: FamilleOuvrage
  niveau: number | null
  nomContient: string | null
}

export type DonneesMaquette = Suivi & {
  maquette: MaquetteLue | null
  elements: ElementMaquette[]
  regles: RegleLue[]
}

export async function chargerMaquette(db: Db, projetId: string): Promise<DonneesMaquette> {
  const [suivi, maquettes, regles] = await Promise.all([
    chargerSuivi(
      db,
      projetId,
      sql`select tache_id from regle_maquette where projet_id = ${projetId}`,
    ),
    db.execute<MaquetteLue>(sql`
      select id, chemin, octets, nom_fichier as "nomFichier", schema_ifc as "schemaIfc",
             etages, importe_le::text as "importeLe"
        from maquette where projet_id = ${projetId}`),
    db.execute<RegleLue>(sql`
      select r.id, r.tache_id as "tacheId", t.code_wbs as "codeWbs", t.nom as "nomTache",
             r.famille, r.niveau, r.nom_contient as "nomContient"
        from regle_maquette r join tache t on t.id = r.tache_id
       where r.projet_id = ${projetId}
       order by t.code_wbs, r.cree_le`),
  ])
  const maquette = maquettes[0] ?? null
  const elements =
    maquette === null
      ? []
      : await db.execute<ElementMaquette>(sql`
          select global_id as "globalId", classe, nom, etage,
                 volume_m3::float8 as "volumeM3", source_quantite as "sourceQuantite"
            from element_maquette where maquette_id = ${maquette.id}
           order by global_id`)
  return { ...suivi, maquette, elements: [...elements], regles: [...regles] }
}

/**
 * Beton prevu de chaque tache feuille : la somme de ses lignes de beton en
 * m3 au quantitatif, ou nul si elle n'en porte aucune.
 */
export async function betonParTache(
  db: Db,
  projetId: string,
): Promise<{ id: string; codeWbs: string; nom: string; betonM3: number | null }[]> {
  const lignes = await db.execute<{
    id: string
    codeWbs: string
    nom: string
    betonM3: number | null
  }>(sql`
    select t.id, t.code_wbs as "codeWbs", t.nom,
           (select sum(q.quantite_prevue) from ligne_quantitatif q
             where q.tache_id = t.id and q.unite = 'M3'
               and q.designation ilike 'béton%')::float8 as "betonM3"
      from tache t join lot l on l.id = t.lot_id
     where l.projet_id = ${projetId}
       and not exists (select 1 from tache e where e.parent_id = t.id)
     order by t.code_wbs`)
  return [...lignes]
}
