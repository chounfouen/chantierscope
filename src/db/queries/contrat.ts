/**
 * Lecture du cadre contractuel : marche initial, avenants, ordres de service
 * et intemperies, et le delai et le montant qui en decoulent.
 */

import { sql } from 'drizzle-orm'
import {
  cadreContractuel,
  type AvenantContrat,
  type CadreContractuel,
  type IntemperieContrat,
  type OrdreServiceContrat,
} from '@/db/compute/contrat'
import type { db as instanceDb } from '@/db/index'
import type { DecisionIntemperie } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

export type IntemperieListee = IntemperieContrat & {
  id: string
  description: string
  lotNom: string | null
}

type MarcheInitial = {
  origine: string
  dureeInitialeJ: number
  montantInitialXof: number
  intemperiesPrevisiblesJ: number
}

export type Contrat = {
  marche: MarcheInitial
  cadre: CadreContractuel
  avenants: AvenantContrat[]
  ordres: OrdreServiceContrat[]
  intemperies: IntemperieListee[]
}

export async function chargerContrat(
  db: Db,
  projetId: string,
  aujourdhui: string,
): Promise<Contrat> {
  const [projets, avenants, ordres, intemperies] = await Promise.all([
    db.execute<MarcheInitial>(sql`
      select date_ordre_service as origine, duree_contractuelle_j as "dureeInitialeJ",
             montant_marche_xof::float8 as "montantInitialXof",
             intemperies_previsibles_j as "intemperiesPrevisiblesJ"
        from projet where id = ${projetId}::uuid`),
    db.execute<AvenantContrat>(sql`
      select numero, date, objet, montant_xof::float8 as "montantXof", delai_j as "delaiJ"
        from avenant where projet_id = ${projetId}::uuid order by numero`),
    db.execute<OrdreServiceContrat>(sql`
      select numero, date, type::text as type, objet, delai_j as "delaiJ"
        from ordre_service where projet_id = ${projetId}::uuid order by numero`),
    db.execute<{
      id: string
      date: string
      jours: number
      decision: DecisionIntemperie
      description: string
      lotNom: string | null
    }>(sql`
      select a.id, a.date, greatest(a.impact_delai_j, 1) as jours,
             a.decision_intemperie::text as decision, a.description, l.nom as "lotNom"
        from alea a left join lot l on l.id = a.lot_id
       where a.projet_id = ${projetId}::uuid and a.type = 'INTEMPERIE'
       order by a.date desc`),
  ])
  const projet = projets[0]
  if (!projet) throw new Error(`Projet introuvable : ${projetId}.`)

  const actes = {
    marche: projet,
    avenants: [...avenants],
    ordres: [...ordres],
    intemperies: [...intemperies],
  }
  return { ...actes, cadre: cadreA(actes, aujourdhui) }
}

/** Le meme contrat, lu a une autre date : la date d'etat d'une analyse. */
export function cadreA(c: Omit<Contrat, 'cadre'>, date: string): CadreContractuel {
  return cadreContractuel({
    ...c.marche,
    avenants: c.avenants,
    ordres: c.ordres,
    intemperies: c.intemperies,
    aujourdhui: date,
  })
}
