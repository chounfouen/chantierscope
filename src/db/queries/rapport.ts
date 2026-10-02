/**
 * Donnees de la periode d'un rapport hebdomadaire.
 *
 * Les indicateurs viennent des instantanes, comme au tableau de bord ; cette
 * lecture ne rassemble que ce qui est propre a la periode : releves, aleas,
 * photos, taches et jalons qui y ont bouge. Les effectifs ne sont lus que
 * pour les roles internes.
 */

import { sql } from 'drizzle-orm'
import type { Periode } from '@/db/compute/rapport'
import type { db as instanceDb } from '@/db/index'

type Db = ReturnType<typeof instanceDb>

export type JourneeRapport = {
  date: string
  lot: string
  meteoCode: number | null
  temperatureC: number | null
  precipitationsMm: number | null
  journeeTravaillee: boolean
  motifArret: string | null
  ouvriers: number | null
  observations: string | null
}

export type DonneesPeriode = {
  lots: {
    id: string
    code: string
    nom: string
    rangCouleur: number
    budget: number
    avancement: number
    vp: number
  }[]
  journees: JourneeRapport[]
  aleas: {
    date: string
    type: string
    gravite: number
    description: string
    lot: string | null
    impactDelaiJ: number
    statut: string
  }[]
  photos: {
    id: string
    date: string
    chemin: string
    legende: string | null
    pointDeVue: string | null
  }[]
  taches: { codeWbs: string; nom: string; debutReel: string | null; finReelle: string | null }[]
  jalonsAtteints: { nom: string; dateReelle: string; datePrevue: string; contractuel: boolean }[]
  jalonsAVenir: { nom: string; datePrevue: string; contractuel: boolean }[]
}

/** Nombre maximal de photos de la planche : deux colonnes sur trois rangs. */
export const PHOTOS_PAR_PLANCHE = 6

export async function chargerPeriode(
  db: Db,
  projetId: string,
  p: Periode,
  interne: boolean,
): Promise<DonneesPeriode> {
  const [lots, journees, aleas, photos, taches, jalonsAtteints, jalonsAVenir] = await Promise.all([
    db.execute<DonneesPeriode['lots'][number]>(sql`
      select l.id, l.code, l.nom, l.rang_couleur as "rangCouleur",
             l.budget_xof::float8 as budget,
             coalesce(s.avancement_pct, 0)::float8 as avancement,
             coalesce(s.valeur_planifiee_xof, 0)::float8 as vp
        from lot l
        left join snapshot_avancement s on s.lot_id = l.id and s.date = ${p.fin}::date
       where l.projet_id = ${projetId}
       order by l.ordre`),
    db.execute<JourneeRapport>(sql`
      select r.date, l.nom as lot, r.meteo_code as "meteoCode",
             r.temperature_c::float8 as "temperatureC",
             r.precipitations_mm::float8 as "precipitationsMm",
             r.journee_travaillee as "journeeTravaillee", r.motif_arret as "motifArret",
             ${interne ? sql`r.effectif_ouvriers` : sql`null`}::int as ouvriers,
             r.observations
        from releve_journalier r join lot l on l.id = r.lot_id
       where r.projet_id = ${projetId} and r.statut = 'VALIDE'
         and r.date between ${p.debut}::date and ${p.fin}::date
       order by r.date, l.ordre`),
    db.execute<DonneesPeriode['aleas'][number]>(sql`
      select a.date, a.type, a.gravite, a.description, l.nom as lot,
             a.impact_delai_j as "impactDelaiJ", a.statut
        from alea a left join lot l on l.id = a.lot_id
       where a.projet_id = ${projetId} and a.date between ${p.debut}::date and ${p.fin}::date
       order by a.date, a.gravite desc`),
    // Les prises de la periode en priorite ; a defaut, les plus recentes :
    // une planche vide n'apprend rien au lecteur.
    db.execute<DonneesPeriode['photos'][number]>(sql`
      select ph.id, (ph.prise_le at time zone 'UTC')::date::text as date, ph.chemin,
             ph.legende, v.nom as "pointDeVue"
        from photo ph left join point_de_vue v on v.id = ph.point_de_vue_id
       where ph.projet_id = ${projetId}
         and (ph.prise_le at time zone 'UTC')::date <= ${p.fin}::date
       order by ((ph.prise_le at time zone 'UTC')::date >= ${p.debut}::date) desc,
                ph.prise_le desc, v.nom
       limit ${PHOTOS_PAR_PLANCHE}`),
    db.execute<DonneesPeriode['taches'][number]>(sql`
      select t.code_wbs as "codeWbs", t.nom,
             t.date_debut_reelle as "debutReel", t.date_fin_reelle as "finReelle"
        from tache t join lot l on l.id = t.lot_id
       where l.projet_id = ${projetId} and t.parent_id is not null
         and (t.date_debut_reelle between ${p.debut}::date and ${p.fin}::date
              or t.date_fin_reelle between ${p.debut}::date and ${p.fin}::date)
       order by t.code_wbs`),
    db.execute<DonneesPeriode['jalonsAtteints'][number]>(sql`
      select nom, date_reelle as "dateReelle", date_prevue as "datePrevue", contractuel
        from jalon
       where projet_id = ${projetId} and date_reelle between ${p.debut}::date and ${p.fin}::date
       order by date_reelle`),
    db.execute<DonneesPeriode['jalonsAVenir'][number]>(sql`
      select nom, date_prevue as "datePrevue", contractuel
        from jalon
       where projet_id = ${projetId} and date_prevue > ${p.fin}::date
         and (date_reelle is null or date_reelle > ${p.fin}::date)
       order by date_prevue`),
  ])
  return {
    lots: [...lots],
    journees: [...journees],
    aleas: [...aleas],
    photos: [...photos],
    taches: [...taches],
    jalonsAtteints: [...jalonsAtteints],
    jalonsAVenir: [...jalonsAVenir],
  }
}
