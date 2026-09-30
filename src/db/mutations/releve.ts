/**
 * Ecritures sur les releves journaliers.
 *
 * Toute mutation suit le meme schema : une seule transaction, l'identite de
 * l'auteur posee en tete pour alimenter le journal d'audit, l'ecriture, puis
 * le recalcul du cache. Si le recalcul echoue, l'ecriture est annulee : on ne
 * laisse jamais la base dans un etat ou les indicateurs contrediraient les
 * donnees.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { recompute, type Recalcul } from '@/db/recompute'

type Db = ReturnType<typeof instanceDb>
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * Pose l'identite de l'auteur pour la duree de la transaction.
 *
 * Le declencheur d'audit lit ce parametre. `set_config` avec le troisieme
 * argument a vrai limite la portee a la transaction courante, ce qui evite
 * qu'une identite reste collee a une connexion reutilisee par le pooler —
 * bug redoutable, car il attribuerait des actions au mauvais utilisateur.
 *
 * La valeur passe par un parametre lie et non par interpolation : un
 * identifiant construit a partir d'une entree non fiable ne doit pas pouvoir
 * devenir du SQL.
 */
export async function poserAuteur(tx: Transaction, utilisateurId: string | null): Promise<void> {
  await tx.execute(sql`select set_config('app.user_id', ${utilisateurId ?? ''}, true)`)
}

export type ResultatValidation = {
  /** Faux si le releve etait deja valide : l'appel n'a alors rien change. */
  modifie: boolean
  releveId: string
  projetId: string
  date: string
  recalcul: Recalcul | null
}

/**
 * Valide un releve soumis, puis recalcule le cache du projet.
 *
 * Idempotente par construction : le filtre porte sur le statut `SOUMIS`, donc
 * un second appel ne trouve rien a mettre a jour et ressort sans rien
 * modifier. Un double clic, un renvoi de formulaire ou une reprise apres
 * coupure reseau ne peuvent pas valider deux fois.
 */
export async function validerReleve(
  db: Db,
  releveId: string,
  utilisateurId: string,
): Promise<ResultatValidation> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, utilisateurId)

    const lignes = await tx.execute<{ id: string; projetId: string; date: string }>(sql`
      update releve_journalier
         set statut = 'VALIDE', valide_par_id = ${utilisateurId}::uuid, valide_le = now()
       where id = ${releveId}::uuid and statut = 'SOUMIS'
       returning id, projet_id as "projetId", date`)

    const modifie = lignes[0]
    if (!modifie) {
      const existant = await tx.execute<{ projetId: string; date: string; statut: string }>(sql`
        select projet_id as "projetId", date, statut::text as statut
          from releve_journalier where id = ${releveId}::uuid`)
      const releve = existant[0]
      if (!releve) throw new Error(`Releve introuvable : ${releveId}.`)
      if (releve.statut === 'BROUILLON') {
        throw new Error('Un releve en brouillon doit d abord etre soumis avant validation.')
      }
      return {
        modifie: false,
        releveId,
        projetId: releve.projetId,
        date: releve.date,
        recalcul: null,
      }
    }

    const recalcul = await recompute(tx as unknown as Db, modifie.projetId)

    return {
      modifie: true,
      releveId: modifie.id,
      projetId: modifie.projetId,
      date: modifie.date,
      recalcul,
    }
  })
}

/**
 * Passe un releve de brouillon a soumis. N'affecte pas les indicateurs : un
 * releve soumis n'est pas encore engage, donc pas encore compte.
 */
export async function soumettreReleve(
  db: Db,
  releveId: string,
  utilisateurId: string,
): Promise<{ modifie: boolean }> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, utilisateurId)
    const lignes = await tx.execute<{ id: string }>(sql`
      update releve_journalier set statut = 'SOUMIS'
       where id = ${releveId}::uuid and statut = 'BROUILLON'
       returning id`)
    return { modifie: lignes.length > 0 }
  })
}

/**
 * Recalcule le cache d'un projet hors de toute mutation.
 *
 * Employee par la tache planifiee nocturne et par les outils de maintenance.
 */
export async function recalculerProjet(
  db: Db,
  projetId: string,
  utilisateurId: string | null = null,
): Promise<Recalcul> {
  return db.transaction(async (tx) => {
    await poserAuteur(tx, utilisateurId)
    return recompute(tx as unknown as Db, projetId)
  })
}
