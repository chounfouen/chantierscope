/**
 * Lecture du plan interactif : zones, taches qui s'y executent, et quantites
 * validees de ces seules taches, pour rejouer l'avancement dans le temps.
 */

import { sql } from 'drizzle-orm'
import type { QuantitePlan, TachePlan } from '@/db/compute/plan'
import { jourDepuis } from '@/db/compute/tableau'
import type { db as instanceDb } from '@/db/index'
import type { MethodeAvancement } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

export type ZoneLue = {
  id: string
  nom: string
  niveau: number
  pathSvg: string
  tacheIds: string[]
}

export type TacheZone = TachePlan & {
  codeWbs: string
  nom: string
  lotId: string
  dateDebutPrevue: string
  dateFinPrevue: string
}

export type DonneesPlan = {
  origine: string
  dateAnalyse: string | null
  zones: ZoneLue[]
  taches: TacheZone[]
  quantites: QuantitePlan[]
}

export async function chargerPlan(db: Db, projetId: string): Promise<DonneesPlan> {
  const [projets, dates, zones, taches, lignes, quantites] = await Promise.all([
    db.execute<{ origine: string }>(sql`
      select date_ordre_service as origine from projet where id = ${projetId}`),
    db.execute<{ date: string | null }>(sql`
      select max(date) as date from snapshot_avancement where projet_id = ${projetId}`),
    db.execute<ZoneLue>(sql`
      select z.id, z.nom, z.niveau, z.path_svg as "pathSvg",
             coalesce(array_agg(zt.tache_id order by zt.tache_id)
                      filter (where zt.tache_id is not null), '{}') as "tacheIds"
        from zone z left join zone_tache zt on zt.zone_id = z.id
       where z.projet_id = ${projetId}
       group by z.id order by z.niveau, z.nom`),
    db.execute<{
      id: string
      codeWbs: string
      nom: string
      lotId: string
      methode: MethodeAvancement
      dateDebutPrevue: string
      dateFinPrevue: string
      duree: number
      critique: boolean
    }>(sql`
      select distinct t.id, t.code_wbs as "codeWbs", t.nom, t.lot_id as "lotId",
             t.methode_avancement as methode,
             t.date_debut_prevue as "dateDebutPrevue", t.date_fin_prevue as "dateFinPrevue",
             t.duree_prevue_j as duree, t.critique
        from tache t join zone_tache zt on zt.tache_id = t.id
        join zone z on z.id = zt.zone_id
       where z.projet_id = ${projetId}
       order by t.code_wbs`),
    db.execute<{
      id: string
      tacheId: string
      quantitePrevue: number
      prixUnitaireXof: number
    }>(sql`
      select q.id, q.tache_id as "tacheId",
             q.quantite_prevue::float8 as "quantitePrevue",
             q.prix_unitaire_xof::float8 as "prixUnitaireXof"
        from ligne_quantitatif q
       where q.tache_id in (
               select zt.tache_id from zone_tache zt join zone z on z.id = zt.zone_id
                where z.projet_id = ${projetId})
       order by q.tache_id, q.id`),
    db.execute<{ ligneId: string; date: string; quantite: number }>(sql`
      select rq.ligne_quantitatif_id as "ligneId", r.date,
             sum(rq.quantite_realisee)::float8 as quantite
        from releve_quantite rq
        join releve_journalier r on r.id = rq.releve_journalier_id
       where r.projet_id = ${projetId} and r.statut = 'VALIDE'
       group by 1, 2 order by 2, 1`),
  ])

  const origine = projets[0]?.origine
  if (origine === undefined) throw new Error(`Projet introuvable : ${projetId}.`)
  const lignesParTache = new Map<string, TachePlan['lignes']>()
  for (const l of lignes) {
    const liste = lignesParTache.get(l.tacheId) ?? []
    liste.push({
      id: l.id,
      quantitePrevue: l.quantitePrevue,
      quantiteRealisee: 0,
      prixUnitaireXof: l.prixUnitaireXof,
    })
    lignesParTache.set(l.tacheId, liste)
  }
  const idsLignes = new Set(lignes.map((l) => l.id))

  return {
    origine,
    dateAnalyse: dates[0]?.date ?? null,
    zones: [...zones],
    taches: taches.map((t) => ({
      ...t,
      debut: jourDepuis(origine, t.dateDebutPrevue),
      lignes: lignesParTache.get(t.id) ?? [],
    })),
    quantites: quantites
      .filter((q) => idsLignes.has(q.ligneId))
      .map((q) => ({
        ligneId: q.ligneId,
        jour: jourDepuis(origine, q.date),
        quantite: q.quantite,
      })),
  }
}
