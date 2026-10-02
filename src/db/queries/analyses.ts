/**
 * Lecture de l'ecran d'analyses.
 *
 * La date d'analyse est celle du dernier instantane, comme au tableau de
 * bord : les deux ecrans parlent de la meme situation. Les effectifs, donnees
 * internes a l'entreprise, ne sont lus que pour les roles qui les voient.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import type {
  AleaAnalyse,
  EquipeAnalyse,
  LigneAnalyse,
  QuantiteAnalyse,
  ReleveAnalyse,
  TacheAnalyse,
} from '@/db/compute/analyses'
import { jourDepuis } from '@/db/compute/tableau'
import type { Nature } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

export type DonneesAnalyses = {
  origine: string
  dateAnalyse: string | null
  jourAnalyse: number
  releves: ReleveAnalyse[]
  quantites: QuantiteAnalyse[]
  lignes: LigneAnalyse[]
  taches: TacheAnalyse[]
  /** Vide pour les roles qui ne voient pas les effectifs. */
  equipes: EquipeAnalyse[]
  aleas: AleaAnalyse[]
}

export async function chargerAnalyses(
  db: Db,
  projetId: string,
  interne: boolean,
): Promise<DonneesAnalyses> {
  const [projets, dates, releves, quantites, lignes, taches, equipes, aleas] = await Promise.all([
    db.execute<{ origine: string }>(sql`
      select date_ordre_service as origine from projet where id = ${projetId}`),
    db.execute<{ date: string | null }>(sql`
      select max(date) as date from snapshot_avancement where projet_id = ${projetId}`),
    db.execute<{
      date: string
      lotId: string
      ouvriers: number
      journeeTravaillee: boolean
      motifArret: string | null
    }>(sql`
      select date, lot_id as "lotId",
             ${interne ? sql`effectif_ouvriers` : sql`0`}::int as ouvriers,
             journee_travaillee as "journeeTravaillee", motif_arret as "motifArret"
        from releve_journalier
       where projet_id = ${projetId} and statut = 'VALIDE'
       order by date, lot_id`),
    db.execute<{ ligneId: string; date: string; quantite: number }>(sql`
      select rq.ligne_quantitatif_id as "ligneId", r.date,
             sum(rq.quantite_realisee)::float8 as quantite
        from releve_quantite rq
        join releve_journalier r on r.id = rq.releve_journalier_id
       where r.projet_id = ${projetId} and r.statut = 'VALIDE'
       group by 1, 2 order by 2, 1`),
    db.execute<LigneAnalyse>(sql`
      select q.id, q.tache_id as "tacheId", q.designation, q.unite,
             q.quantite_prevue::float8 as "quantitePrevue",
             q.prix_unitaire_xof::float8 as "prixUnitaireXof"
        from ligne_quantitatif q
        join tache t on t.id = q.tache_id join lot l on l.id = t.lot_id
       where l.projet_id = ${projetId}
       order by t.code_wbs, q.designation, q.id`),
    db.execute<{ id: string; lotId: string; nature: Nature; debut: string; duree: number }>(sql`
      select t.id, t.lot_id as "lotId", t.nature,
             t.date_debut_prevue as debut, t.duree_prevue_j as duree
        from tache t join lot l on l.id = t.lot_id
       where l.projet_id = ${projetId} and t.parent_id is not null
       order by t.code_wbs`),
    interne
      ? db.execute<{ tacheId: string; ouvriers: number; debut: string; fin: string }>(sql`
          select a.tache_id as "tacheId", round(a.quantite * r.capacite)::int as ouvriers,
                 a.date_debut as debut, a.date_fin as fin
            from affectation a
            join ressource r on r.id = a.ressource_id
            join tache t on t.id = a.tache_id join lot l on l.id = t.lot_id
           where l.projet_id = ${projetId} and r.type = 'EQUIPE'
           order by a.id`)
      : Promise.resolve([] as { tacheId: string; ouvriers: number; debut: string; fin: string }[]),
    db.execute<{ date: string; type: string; gravite: number; impactDelaiJ: number }>(sql`
      select date, type, gravite, impact_delai_j as "impactDelaiJ"
        from alea where projet_id = ${projetId} order by date, id`),
  ])

  const origine = projets[0]?.origine
  if (origine === undefined) throw new Error(`Projet introuvable : ${projetId}.`)
  const dateAnalyse = dates[0]?.date ?? null
  const jour = (d: string) => jourDepuis(origine, d)

  return {
    origine,
    dateAnalyse,
    jourAnalyse: dateAnalyse === null ? -1 : jour(dateAnalyse),
    releves: releves.map((r) => ({ ...r, jour: jour(r.date) })),
    quantites: quantites.map((q) => ({
      ligneId: q.ligneId,
      jour: jour(q.date),
      quantite: q.quantite,
    })),
    lignes: [...lignes],
    taches: taches.map((t) => ({
      id: t.id,
      lotId: t.lotId,
      nature: t.nature,
      debut: jour(t.debut),
      duree: t.duree,
    })),
    equipes: equipes.map((e) => ({
      tacheId: e.tacheId,
      ouvriers: e.ouvriers,
      debut: jour(e.debut),
      fin: jour(e.fin),
    })),
    aleas: aleas.map((a) => ({
      jour: jour(a.date),
      type: a.type,
      gravite: a.gravite,
      impactDelaiJ: a.impactDelaiJ,
    })),
  }
}
