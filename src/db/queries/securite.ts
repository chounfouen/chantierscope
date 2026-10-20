/**
 * Lecture de la sous-traitance et du registre de securite.
 *
 * Les effectifs et les heures sont des donnees internes de l'entreprise :
 * pour le maitre d'ouvrage, la requete ne les selectionne pas.
 */

import { sql } from 'drizzle-orm'
import {
  indicateursSecurite,
  situationSousTraitant,
  type IndicateursSecurite,
} from '@/db/compute/securite'
import type { db as instanceDb } from '@/db/index'
import type { StatutAgrement, TypeEvenementSecurite } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

export type SousTraitantLu = {
  id: string
  raisonSociale: string
  specialite: string
  montantXof: number
  paiementDirect: boolean
  statut: StatutAgrement
  demandeLe: string
  statueLe: string | null
  lots: { id: string; code: string; nom: string }[]
  avancement: number
  travauxXof: number
  /** Donnees internes : nulles pour le maitre d'ouvrage. */
  hommesJours: number | null
  /** Journees travaillees sur ses lots avant son agrement : a regulariser. */
  presencesSansAgrement: number | null
}

export async function chargerSousTraitants(
  db: Db,
  projetId: string,
  interne: boolean,
): Promise<{ sousTraitants: SousTraitantLu[]; montantMarcheXof: number }> {
  const [lignes, lots, projets] = await Promise.all([
    db.execute<Omit<SousTraitantLu, 'lots' | 'avancement' | 'travauxXof'>>(sql`
      select s.id, s.raison_sociale as "raisonSociale", s.specialite,
             s.montant_xof::float8 as "montantXof", s.paiement_direct as "paiementDirect",
             s.statut::text as statut, s.demande_le::text as "demandeLe",
             s.statue_le::text as "statueLe",
             ${
               interne
                 ? sql`(select coalesce(sum(r.effectif_ouvriers + r.effectif_encadrement), 0)::int
                          from releve_journalier r join sous_traitant_lot sl on sl.lot_id = r.lot_id
                         where sl.sous_traitant_id = s.id and r.statut = 'VALIDE'
                           and r.journee_travaillee)`
                 : sql`null::int`
             } as "hommesJours",
             ${
               interne
                 ? sql`(select count(*)::int
                          from releve_journalier r join sous_traitant_lot sl on sl.lot_id = r.lot_id
                         where sl.sous_traitant_id = s.id and r.statut = 'VALIDE'
                           and r.journee_travaillee and r.effectif_ouvriers > 0
                           and (s.statut <> 'AGREE' or r.date < s.statue_le))`
                 : sql`null::int`
             } as "presencesSansAgrement"
        from sous_traitant s
       where s.projet_id = ${projetId}::uuid
       order by s.demande_le, s.raison_sociale`),
    db.execute<{
      sousTraitantId: string
      id: string
      code: string
      nom: string
      budgetXof: number
      valeurAcquiseXof: number
    }>(sql`
      select sl.sous_traitant_id as "sousTraitantId", l.id, l.code, l.nom,
             coalesce((select sum(q.quantite_prevue * q.prix_unitaire_xof)
                         from ligne_quantitatif q join tache t on t.id = q.tache_id
                        where t.lot_id = l.id), 0)::float8 as "budgetXof",
             coalesce((select s.valeur_acquise_xof from snapshot_avancement s
                        where s.lot_id = l.id order by s.date desc limit 1), 0)::float8
               as "valeurAcquiseXof"
        from sous_traitant_lot sl join lot l on l.id = sl.lot_id
       where l.projet_id = ${projetId}::uuid
       order by l.ordre`),
    db.execute<{ montant: number }>(sql`
      select montant_marche_xof::float8 as montant from projet where id = ${projetId}::uuid`),
  ])

  return {
    montantMarcheXof: projets[0]?.montant ?? 0,
    sousTraitants: lignes.map((s) => {
      const siens = lots.filter((l) => l.sousTraitantId === s.id)
      return {
        ...s,
        lots: siens.map(({ id, code, nom }) => ({ id, code, nom })),
        ...situationSousTraitant({ montantXof: s.montantXof, lots: siens }),
      }
    }),
  }
}

export type EvenementLu = {
  id: string
  date: string
  type: TypeEvenementSecurite
  description: string
  joursArret: number
  participants: number | null
  lotNom: string | null
  sousTraitant: string | null
}

export type IndicateursLus = Omit<IndicateursSecurite, 'heures'> & {
  /** Donnee interne : nulle pour le maitre d'ouvrage. */
  heures: number | null
}

export async function chargerSecurite(
  db: Db,
  projetId: string,
  aujourdhui: string,
  interne: boolean,
): Promise<{ evenements: EvenementLu[]; indicateurs: IndicateursLus }> {
  const [evenements, heures, projets] = await Promise.all([
    db.execute<EvenementLu>(sql`
      select e.id, e.date::text as date, e.type::text as type, e.description,
             e.jours_arret as "joursArret", e.participants,
             l.nom as "lotNom", s.raison_sociale as "sousTraitant"
        from evenement_securite e
        left join lot l on l.id = e.lot_id
        left join sous_traitant s on s.id = e.sous_traitant_id
       where e.projet_id = ${projetId}::uuid
       order by e.date desc, e.cree_le desc`),
    // Le taux de frequence est un indicateur public ; les heures qui le
    // fondent ne sortent de cette fonction que pour les roles internes.
    db.execute<{ heures: number }>(sql`
      select coalesce(sum(heures_travaillees), 0)::float8 as heures from releve_journalier
       where projet_id = ${projetId}::uuid and statut = 'VALIDE' and date <= ${aujourdhui}::date`),
    db.execute<{ origine: string }>(sql`
      select date_ordre_service::text as origine from projet where id = ${projetId}::uuid`),
  ])
  const evts = [...evenements]
  const indicateurs = indicateursSecurite({
    evenements: evts,
    heures: heures[0]?.heures ?? 0,
    origine: projets[0]?.origine ?? aujourdhui,
    aujourdhui,
  })
  return {
    evenements: evts,
    indicateurs: { ...indicateurs, heures: interne ? indicateurs.heures : null },
  }
}
