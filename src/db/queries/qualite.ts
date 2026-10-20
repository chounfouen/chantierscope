/**
 * Lecture de la qualite : registre des essais du beton, conformite de chaque
 * coulage, points d'arret et fiches de non-conformite.
 */

import { sql } from 'drizzle-orm'
import { conformiteCoulage, type ConformiteCoulage } from '@/db/compute/beton'
import type { db as instanceDb } from '@/db/index'
import type { StatutNonConformite } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

export type CoulageQualite = {
  id: string
  date: string
  lotNom: string
  ouvrage: string
  classeBeton: string
  volumeM3: number
  eprouvettesPrevues: number
  ferraillageReceptionne: boolean | null
  moyenne7: number | null
  conformite: ConformiteCoulage
}

export type FicheNonConformite = {
  id: string
  numero: number
  dateConstat: string
  lotNom: string | null
  titre: string
  constat: string
  gravite: number
  cause: string | null
  action: string | null
  statut: StatutNonConformite
  traiteeLe: string | null
  leveeLe: string | null
  coulageId: string | null
  coutXof: number | null
}

export type Qualite = {
  coulages: CoulageQualite[]
  fiches: FicheNonConformite[]
  synthese: {
    volumeM3: number
    conformes: number
    nonConformes: number
    enAttente: number
    resultatsEnRetard: number
    pointsArretFranchis: number
    fichesOuvertes: number
  }
}

export async function chargerQualite(
  db: Db,
  projetId: string,
  aujourdhui: string,
  interne: boolean,
): Promise<Qualite> {
  const [coulages, essais, fiches] = await Promise.all([
    db.execute<Omit<CoulageQualite, 'moyenne7' | 'conformite'>>(sql`
      select c.id, r.date::text as date, l.nom as "lotNom", c.ouvrage,
             c.classe_beton as "classeBeton", c.volume_m3::float8 as "volumeM3",
             c.eprouvettes as "eprouvettesPrevues",
             c.ferraillage_receptionne as "ferraillageReceptionne"
        from releve_coulage c
        join releve_journalier r on r.id = c.releve_journalier_id
        join lot l on l.id = r.lot_id
       where r.projet_id = ${projetId}::uuid and r.statut = 'VALIDE'
       order by r.date desc, c.rang`),
    db.execute<{ coulageId: string; prelevement: number; ageJ: number; resistanceMpa: number }>(sql`
      select e.coulage_id as "coulageId", e.prelevement, e.age_j as "ageJ",
             e.resistance_mpa::float8 as "resistanceMpa"
        from essai_beton e
        join releve_coulage c on c.id = e.coulage_id
        join releve_journalier r on r.id = c.releve_journalier_id
       where r.projet_id = ${projetId}::uuid and e.date_ecrasement <= ${aujourdhui}::date`),
    db.execute<FicheNonConformite>(sql`
      select n.id, n.numero, n.date_constat::text as "dateConstat", l.nom as "lotNom",
             n.titre, n.constat, n.gravite, n.cause, n.action, n.statut::text as statut,
             n.traitee_le::text as "traiteeLe", n.levee_le::text as "leveeLe",
             n.coulage_id as "coulageId",
             ${interne ? sql`a.impact_cout_xof::float8` : sql`null::float8`} as "coutXof"
        from non_conformite n
        left join lot l on l.id = n.lot_id
        left join alea a on a.id = n.alea_id
       where n.projet_id = ${projetId}::uuid
       order by n.numero desc`),
  ])

  const parCoulage = new Map<
    string,
    { prelevement: number; ageJ: number; resistanceMpa: number }[]
  >()
  for (const e of essais) {
    parCoulage.set(e.coulageId, [...(parCoulage.get(e.coulageId) ?? []), e])
  }
  const lus: CoulageQualite[] = coulages.map((c) => {
    const eprouvettes = parCoulage.get(c.id) ?? []
    const sept = eprouvettes.filter((e) => e.ageJ === 7)
    return {
      ...c,
      moyenne7:
        sept.length === 0 ? null : sept.reduce((s, e) => s + e.resistanceMpa, 0) / sept.length,
      conformite: conformiteCoulage({
        classeBeton: c.classeBeton,
        dateCoulage: c.date,
        eprouvettes,
        aujourdhui,
      }),
    }
  })
  const compte = (etat: ConformiteCoulage['etat']) =>
    lus.filter((c) => c.conformite.etat === etat).length

  return {
    coulages: lus,
    fiches: [...fiches],
    synthese: {
      volumeM3: lus.reduce((s, c) => s + c.volumeM3, 0),
      conformes: compte('CONFORME'),
      nonConformes: compte('NON_CONFORME'),
      enAttente: compte('EN_ATTENTE') + compte('SANS_ESSAI'),
      resultatsEnRetard: compte('RESULTAT_EN_RETARD'),
      pointsArretFranchis: lus.filter((c) => c.ferraillageReceptionne === false).length,
      fichesOuvertes: fiches.filter((f) => f.statut !== 'LEVEE').length,
    },
  }
}
