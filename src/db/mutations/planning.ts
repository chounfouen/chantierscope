/**
 * Ecritures sur le planning : durees, contraintes de debut, liaisons.
 *
 * Chaque modification suit le meme chemin, dans une seule transaction :
 * lecture du reseau, controle, ecriture de la source de verite (duree,
 * contrainte, liaison), RECALAGE des dates prevues par le calcul au plus tot,
 * puis recalcul du cache. Les dates prevues ne sont jamais saisies une a une :
 * elles decoulent du reseau, ce qui garantit qu'aucune barre du Gantt ne
 * contredit ses liaisons.
 *
 * Le journal d'audit trace chaque ecriture, taches et liaisons comprises.
 */

import { addDays, formatISO, parseISO } from 'date-fns'
import { sql } from 'drizzle-orm'
import { datesNoeuds, modifierTache, recaler, verifierLiaison } from '@/db/compute/planning'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { poserAuteur } from '@/db/mutations/releve'
import {
  chargerPlanning,
  jourDuPlanning,
  reseauDuPlanning,
  type Planning,
} from '@/db/queries/planning'
import { recompute, type Recalcul } from '@/db/recompute'
import { dateCourte } from '@/lib/format'
import type { TypeLiaison } from '@/db/schema'

type Db = ReturnType<typeof instanceDb>
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]

export type ResultatEdition = {
  recalcul: Recalcul
  /** Message a montrer quand la modification est acceptee mais sans effet visible. */
  avertissement: string | null
  /** Nouvelle duree du reseau, en jours. */
  dureeReseauJ: number
}

function dateDuJour(origine: string, jour: number): string {
  return formatISO(addDays(parseISO(origine), jour), { representation: 'date' })
}

/**
 * Ecrit les dates prevues issues du recalage : taches feuilles, noeuds de la
 * WBS, jalons internes. Les jalons contractuels gardent leur date : elle est
 * celle du marche, et c'est precisement contre elle qu'on mesure un retard.
 */
async function ecrireRecalage(
  tx: Transaction,
  planning: Planning,
  reseau = reseauDuPlanning(planning),
) {
  const origine = planning.projet.dateOrdreService
  const { dates, resultat } = recaler(reseau)

  const feuilles = new Map(
    planning.taches
      .filter((t) => t.feuille)
      .map((t) => {
        const d = dates.get(t.id) ?? { debut: 0, fin: 0 }
        return [t.id, { ...d, parentId: t.parentId }] as const
      }),
  )
  const noeuds = datesNoeuds(
    planning.taches.filter((t) => !t.feuille).map((t) => ({ id: t.id, parentId: t.parentId })),
    feuilles,
  )

  const valeurs = [...feuilles.entries(), ...noeuds.entries()].map(
    ([id, d]) =>
      sql`(${id}::uuid, ${dateDuJour(origine, d.debut)}::date, ${dateDuJour(origine, d.fin)}::date)`,
  )
  if (valeurs.length > 0) {
    // Une seule instruction pour toutes les taches, par jointure sur une table
    // de valeurs. La duree n'est reecrite que pour les noeuds : celle des
    // feuilles est la source, pas une consequence.
    await tx.execute(sql`
      update tache t set
        date_debut_prevue = v.debut,
        date_fin_prevue = v.fin,
        duree_prevue_j = case when t.parent_id is null then v.fin - v.debut + 1 else t.duree_prevue_j end
      from (values ${sql.join(valeurs, sql`, `)}) as v(id, debut, fin)
      where t.id = v.id
        and (t.date_debut_prevue <> v.debut or t.date_fin_prevue <> v.fin)`)
  }

  await tx.execute(sql`
    update jalon j set date_prevue = t.date_fin_prevue
      from tache t
     where j.tache_declenchante_id = t.id and j.projet_id = ${planning.projet.id}::uuid
       and not j.contractuel and j.date_prevue <> t.date_fin_prevue`)

  return resultat
}

function nommer(planning: Planning, ids: readonly string[]): string {
  const parId = new Map(planning.taches.map((t) => [t.id, t]))
  return ids
    .map((id) => {
      const t = parId.get(id)
      return t ? `${t.codeWbs} ${t.nom}` : id
    })
    .join(', ')
}

function tacheFeuille(planning: Planning, tacheId: string) {
  const t = planning.taches.find((x) => x.id === tacheId)
  if (!t) throw new RefusMetier('INTROUVABLE', 'Tâche introuvable dans ce projet.')
  if (!t.feuille) {
    throw new RefusMetier(
      'INCOHERENT',
      'Les dates d’un regroupement découlent de ses tâches : modifier plutôt les tâches.',
    )
  }
  return t
}

/* -------------------------------------------------------------------------- */
/* Taches                                                                     */
/* -------------------------------------------------------------------------- */

export type ModificationTache = {
  /** Nouvelle duree, en jours calendaires. */
  dureeJ?: number
  /** Nouvelle contrainte « pas avant » ; nul pour la retirer. */
  debutImpose?: string | null
}

export async function modifierTachePlanning(
  db: Db,
  projetId: string,
  tacheId: string,
  m: ModificationTache,
  auteurId: string,
): Promise<ResultatEdition> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const planning = await chargerPlanning(tx as unknown as Db, projetId)
    const t = tacheFeuille(planning, tacheId)
    const origine = planning.projet.dateOrdreService

    if (
      m.dureeJ !== undefined &&
      (!Number.isInteger(m.dureeJ) || m.dureeJ < 1 || m.dureeJ > 2000)
    ) {
      throw new RefusMetier(
        'INCOHERENT',
        'Une durée est un nombre entier de jours, entre 1 et 2000.',
      )
    }
    if (m.debutImpose !== undefined && m.debutImpose !== null && m.debutImpose < origine) {
      throw new RefusMetier(
        'INCOHERENT',
        `Une tâche ne peut pas commencer avant l’ordre de service du ${dateCourte(origine)}.`,
      )
    }

    const reseau = modifierTache(reseauDuPlanning(planning), tacheId, {
      ...(m.dureeJ !== undefined ? { duree: m.dureeJ } : {}),
      ...(m.debutImpose !== undefined
        ? { debutImpose: m.debutImpose === null ? null : jourDuPlanning(origine, m.debutImpose) }
        : {}),
    })

    await tx.execute(sql`
      update tache set
        duree_prevue_j = ${m.dureeJ ?? t.dureePrevueJ},
        debut_impose = ${m.debutImpose === undefined ? t.debutImpose : m.debutImpose}::date
      where id = ${tacheId}::uuid`)

    const resultat = await ecrireRecalage(tx, planning, reseau)

    let avertissement: string | null = null
    if (m.debutImpose) {
      const debut = resultat.dates.get(tacheId)?.debutTot ?? 0
      if (debut > jourDuPlanning(origine, m.debutImpose)) {
        avertissement =
          `Contrainte enregistrée mais sans effet : les prédécesseurs imposent déjà un début ` +
          `au ${dateCourte(dateDuJour(origine, debut))}.`
      }
    }

    const recalcul = await recompute(tx as unknown as Db, projetId)
    return { recalcul, avertissement, dureeReseauJ: resultat.dureeTotale }
  })
}

/* -------------------------------------------------------------------------- */
/* Liaisons                                                                   */
/* -------------------------------------------------------------------------- */

export type NouvelleLiaison = {
  amontId: string
  avalId: string
  type: TypeLiaison
  decalageJ: number
}

export async function ajouterLiaison(
  db: Db,
  projetId: string,
  l: NouvelleLiaison,
  auteurId: string,
): Promise<ResultatEdition & { liaisonId: string }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const planning = await chargerPlanning(tx as unknown as Db, projetId)
    tacheFeuille(planning, l.amontId)
    tacheFeuille(planning, l.avalId)
    if (!Number.isInteger(l.decalageJ) || Math.abs(l.decalageJ) > 365) {
      throw new RefusMetier('INCOHERENT', 'Le décalage est un nombre entier de jours, au plus 365.')
    }

    const reseau = reseauDuPlanning(planning)
    const candidate = { amont: l.amontId, aval: l.avalId, type: l.type, decalage: l.decalageJ }
    const verdict = verifierLiaison(reseau, candidate)
    if (!verdict.admise) {
      throw new RefusMetier(
        'INCOHERENT',
        verdict.motif === 'boucle'
          ? `Cette liaison fermerait un circuit : ${nommer(planning, verdict.taches)}. ` +
              'Une tâche ne peut pas dépendre d’elle-même, même indirectement.'
          : verdict.motif === 'doublon'
            ? `Ces deux tâches sont déjà liées : ${nommer(planning, verdict.taches)}. ` +
              'Modifier la liaison existante plutôt que d’en ajouter une seconde.'
            : 'Tâche inconnue dans ce projet.',
      )
    }

    const [cree] = await tx.execute<{ id: string }>(sql`
      insert into liaison (tache_amont_id, tache_aval_id, type, decalage_j)
      values (${l.amontId}::uuid, ${l.avalId}::uuid, ${l.type}::type_liaison, ${l.decalageJ})
      returning id`)

    const resultat = await ecrireRecalage(tx, planning, {
      taches: reseau.taches,
      liaisons: [...reseau.liaisons, candidate],
    })
    const recalcul = await recompute(tx as unknown as Db, projetId)
    return {
      recalcul,
      avertissement: null,
      dureeReseauJ: resultat.dureeTotale,
      liaisonId: cree?.id as string,
    }
  })
}

export async function supprimerLiaison(
  db: Db,
  projetId: string,
  liaisonId: string,
  auteurId: string,
): Promise<ResultatEdition> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    const planning = await chargerPlanning(tx as unknown as Db, projetId)
    if (!planning.liaisons.some((l) => l.id === liaisonId)) {
      throw new RefusMetier('INTROUVABLE', 'Liaison introuvable dans ce projet.')
    }
    await tx.execute(sql`delete from liaison where id = ${liaisonId}::uuid`)

    const restantes = { ...planning, liaisons: planning.liaisons.filter((l) => l.id !== liaisonId) }
    const resultat = await ecrireRecalage(tx, restantes)
    const recalcul = await recompute(tx as unknown as Db, projetId)
    return { recalcul, avertissement: null, dureeReseauJ: resultat.dureeTotale }
  })
}

/* -------------------------------------------------------------------------- */
/* Scenarios de simulation                                                    */
/* -------------------------------------------------------------------------- */

export type PerturbationEnregistree = { tacheId: string; decalageJ: number; allongementJ: number }

export async function enregistrerScenario(
  db: Db,
  projetId: string,
  s: { nom: string; description: string | null; perturbations: PerturbationEnregistree[] },
  auteurId: string,
): Promise<{ id: string }> {
  const planning = await chargerPlanning(db, projetId)
  const ids = new Set(planning.taches.filter((t) => t.feuille).map((t) => t.id))
  if (s.perturbations.length === 0) {
    throw new RefusMetier('INCOHERENT', 'Un scénario porte au moins une perturbation.')
  }
  if (s.perturbations.some((p) => !ids.has(p.tacheId))) {
    throw new RefusMetier('INCOHERENT', 'Une tâche du scénario n’appartient pas au projet.')
  }
  const [cree] = await db.execute<{ id: string }>(sql`
    insert into scenario_simulation (projet_id, nom, description, perturbations, cree_par_id)
    values (${projetId}::uuid, ${s.nom.trim()}, ${s.description}, ${JSON.stringify(s.perturbations)}::jsonb,
            ${auteurId}::uuid)
    returning id`)
  return { id: cree?.id as string }
}

export async function supprimerScenario(
  db: Db,
  projetId: string,
  scenarioId: string,
): Promise<void> {
  await db.execute(sql`
    delete from scenario_simulation where id = ${scenarioId}::uuid and projet_id = ${projetId}::uuid`)
}
