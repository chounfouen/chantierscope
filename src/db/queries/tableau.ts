/**
 * Lecture du tableau de bord.
 *
 * Tout ce qui est chiffre se lit dans les instantanes precalcules ; le reste
 * — taches, liaisons, jalons, aleas, releves en attente — tient en quelques
 * centaines de lignes indexees. Aucun releve n'est agrege ici : c'est la
 * condition du chargement en moins d'une seconde.
 *
 * Comme les autres requetes de lecture, le drapeau `interne` commande la
 * selection des colonnes : cout reel et debourse ne quittent pas le serveur
 * pour le maitre d'ouvrage.
 */

import { sql } from 'drizzle-orm'
import type { CadreContractuel } from '@/db/compute/contrat'
import type { db as instanceDb } from '@/db/index'
import { cadreA, chargerContrat } from '@/db/queries/contrat'
import { formatISO } from 'date-fns'
import {
  jourDepuis,
  type AleaSuivi,
  type CadreProjet,
  type JalonSuivi,
  type LigneSuivie,
  type PointSynthese,
  type ReleveSuivi,
  type TacheBudgetee,
  type TacheSuivie,
} from '@/db/compute/tableau'
import type { LiaisonReseau } from '@/db/compute/types'
import type { TypeLiaison } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>

export type DonneesTableau = {
  origine: string
  /**
   * Fin contractuelle EN VIGUEUR, apres avenants, ordres de service et
   * intemperies reconnues. Le cadre porte de meme le delai et le montant en
   * vigueur : ce sont eux qui fixent penalite et retard.
   */
  finContractuelle: string
  /** Detail du cadre contractuel, pour l'expliquer a l'ecran. */
  contrat: CadreContractuel
  courbe: PointSynthese[]
  cadre: CadreProjet
  /**
   * `refDebut` et `refDuree` : dates de la reference active, sur lesquelles se
   * prolonge la courbe planifiee. Les dates courantes servent a la projection.
   */
  taches: (TacheSuivie & { lotId: string; budget: number; refDebut: number; refDuree: number })[]
  liaisons: LiaisonReseau[]
  jalons: JalonSuivi[]
  aleas: AleaSuivi[]
  releves: ReleveSuivi[]
  lignes: LigneSuivie[]
}

export async function chargerTableau(
  db: Db,
  projetId: string,
  interne: boolean,
): Promise<DonneesTableau> {
  const [projets, courbe, debourses, taches, liaisons, jalons, aleas, releves, lignes, contrat] =
    await Promise.all([
      db.execute<{
        origine: string
        dureeContractuelleJ: number
        montantMarcheXof: number
        tauxPenaliteJournaliere: number
        plafondPenalite: number
      }>(sql`
        select date_ordre_service as origine,
               duree_contractuelle_j as "dureeContractuelleJ",
               montant_marche_xof::float8 as "montantMarcheXof",
               taux_penalite_journaliere::float8 as "tauxPenaliteJournaliere",
               plafond_penalite::float8 as "plafondPenalite"
          from projet where id = ${projetId}`),

      db.execute<PointSynthese>(sql`
        select date, avancement_pct::float8 as avancement,
               valeur_planifiee_xof::float8 as vp,
               valeur_acquise_xof::float8   as va,
               ${interne ? sql`cout_reel_xof::float8` : sql`null::float8`} as cr,
               date_fin_projetee as "finProjetee"
          from snapshot_avancement
         where projet_id = ${projetId} and lot_id is null
         order by date`),

      db.execute<{ debourse: number | null }>(sql`
        select ${interne ? sql`budget_debourse_xof::float8` : sql`null::float8`} as debourse
          from snapshot_avancement
         where projet_id = ${projetId} and lot_id is null
         order by date desc limit 1`),

      db.execute<{
        id: string
        lotId: string
        codeWbs: string
        nom: string
        debut: string
        duree: number
        debutImpose: string | null
        debutReel: string | null
        finReelle: string | null
        avancement: number
        critique: boolean
        budget: number
        refDebut: string | null
        refDuree: number | null
      }>(sql`
        select t.id, t.lot_id as "lotId", t.code_wbs as "codeWbs", t.nom,
               t.date_debut_prevue as debut, t.duree_prevue_j as duree,
               t.debut_impose as "debutImpose",
               t.date_debut_reelle as "debutReel", t.date_fin_reelle as "finReelle",
               t.avancement_pct::float8 as avancement, t.critique,
               t.poids_budgetaire_xof::float8 as budget,
               rt.date_debut as "refDebut", rt.duree_j as "refDuree"
          from tache t join lot l on l.id = t.lot_id
          left join reference_planning rp on rp.projet_id = l.projet_id and rp.active
          left join reference_tache rt on rt.reference_id = rp.id and rt.tache_id = t.id
         where l.projet_id = ${projetId} and t.parent_id is not null
         order by t.code_wbs`),

      db.execute<{ amont: string; aval: string; type: TypeLiaison; decalage: number }>(sql`
        select li.tache_amont_id as amont, li.tache_aval_id as aval,
               li.type, li.decalage_j as decalage
          from liaison li
          join tache t on t.id = li.tache_aval_id
          join lot l on l.id = t.lot_id
         where l.projet_id = ${projetId}`),

      db.execute<JalonSuivi>(sql`
        select id, nom, contractuel, date_prevue as "datePrevue",
               date_reelle as "dateReelle",
               tache_declenchante_id as "tacheDeclenchanteId"
          from jalon where projet_id = ${projetId} order by date_prevue, ordre`),

      db.execute<AleaSuivi>(sql`
        select id, type, gravite, statut, date, description, lot_id as "lotId"
          from alea
         where projet_id = ${projetId}
           and ((type = 'NON_CONFORMITE' and statut <> 'SOLDE')
                or (type = 'INTEMPERIE' and decision_intemperie = 'PROPOSEE'))`),

      // Le circuit de validation est une affaire interne : le maitre
      // d'ouvrage ne voit pas les releves en attente.
      interne
        ? db.execute<ReleveSuivi>(sql`
            select r.id, r.date, r.statut, r.lot_id as "lotId", l.nom as "lotNom"
              from releve_journalier r join lot l on l.id = r.lot_id
             where r.projet_id = ${projetId} and r.statut in ('BROUILLON', 'SOUMIS')`)
        : Promise.resolve([] as ReleveSuivi[]),

      db.execute<LigneSuivie>(sql`
        select q.id, q.designation, q.unite, t.code_wbs as "codeWbs", t.lot_id as "lotId",
               q.quantite_prevue::float8 as "quantitePrevue",
               coalesce(r.realise, 0)::float8 as "quantiteRealisee"
          from ligne_quantitatif q
          join tache t on t.id = q.tache_id
          join lot l on l.id = t.lot_id
          left join (
            select rq.ligne_quantitatif_id as ligne, sum(rq.quantite_realisee) as realise
              from releve_quantite rq
              join releve_journalier rj on rj.id = rq.releve_journalier_id
             where rj.projet_id = ${projetId} and rj.statut = 'VALIDE'
             group by 1
          ) r on r.ligne = q.id
         where l.projet_id = ${projetId}`),

      chargerContrat(db, projetId, formatISO(new Date(), { representation: 'date' })),
    ])

  const projet = projets[0]
  if (!projet) throw new Error(`Projet introuvable : ${projetId}.`)
  const { origine } = projet
  // Le contrat se lit a la date d'etat, comme tout le reste du tableau : une
  // analyse a une date passee ignore les actes signes depuis.
  const dateEtat = courbe.at(-1)?.date
  const cadreContrat = dateEtat === undefined ? contrat.cadre : cadreA(contrat, dateEtat)
  const jour = (d: string | null) => (d === null ? null : jourDepuis(origine, d))

  const tachesSuivies = taches.map((t) => ({
    id: t.id,
    lotId: t.lotId,
    codeWbs: t.codeWbs,
    nom: t.nom,
    debut: jourDepuis(origine, t.debut),
    duree: t.duree,
    debutImpose: jour(t.debutImpose),
    debutReel: jour(t.debutReel),
    finReelle: jour(t.finReelle),
    avancement: t.avancement,
    critique: t.critique,
    budget: t.budget,
    refDebut: t.refDebut === null ? jourDepuis(origine, t.debut) : jourDepuis(origine, t.refDebut),
    refDuree: t.refDuree ?? t.duree,
  }))
  const bacXof = tachesSuivies.reduce((s, t) => s + t.budget, 0)

  return {
    origine,
    courbe: [...courbe],
    cadre: {
      bacXof,
      // Pour le maitre d'ouvrage, le debourse n'est pas lu : le coefficient
      // vaut un, et les indicateurs de cout restent nuls faute de cout reel.
      budgetDebourseXof: debourses[0]?.debourse ?? bacXof,
      dureeContractuelleJ: cadreContrat.dureeJ,
      montantMarcheXof: cadreContrat.montantXof,
      tauxPenaliteJournaliere: projet.tauxPenaliteJournaliere,
      plafondPenalite: projet.plafondPenalite,
    },
    finContractuelle: cadreContrat.finContractuelle,
    contrat: cadreContrat,
    taches: tachesSuivies,
    liaisons: [...liaisons],
    jalons: [...jalons],
    aleas: [...aleas],
    releves: [...releves],
    lignes: [...lignes],
  }
}

/** Taches budgetees, pour prolonger la courbe planifiee au-dela du jour. */
export function tachesBudgetees(d: DonneesTableau): TacheBudgetee[] {
  return d.taches.map((t) => ({ debut: t.refDebut, duree: t.refDuree, budget: t.budget }))
}
