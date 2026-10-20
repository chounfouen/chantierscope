/**
 * Ecritures du cadre contractuel : avenants, ordres de service, decisions
 * sur les intemperies.
 *
 * Chacune recalcule le cache : le delai en vigueur change la fin
 * contractuelle, donc la penalite et les marges du planning recale.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { figerReference } from '@/db/mutations/planning'
import { poserAuteur } from '@/db/mutations/releve'
import { recompute } from '@/db/recompute'
import type { DecisionIntemperie, TypeOrdreService } from '@/db/schema'
import { verrouillerProjet } from '@/db/verrou'

type Db = ReturnType<typeof instanceDb>
type Transaction = Parameters<Parameters<Db['transaction']>[0]>[0]

export type NouvelAvenant = {
  date: string
  objet: string
  montantXof: number
  delaiJ: number
  /**
   * Vrai pour figer dans la foulee le planning courant comme nouvelle
   * reference : un avenant qui ajoute des travaux ou du delai change ce
   * contre quoi se mesure l'avancement.
   */
  figerReference: boolean
}

export async function ajouterAvenant(
  db: Db,
  projetId: string,
  a: NouvelAvenant,
  auteurId: string,
): Promise<{ numero: number }> {
  const numero = await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verrouillerProjet(tx, projetId)
    const [n] = await tx.execute<{ numero: number }>(sql`
      insert into avenant (projet_id, numero, date, objet, montant_xof, delai_j, cree_par_id)
      select ${projetId}::uuid, coalesce(max(numero), 0) + 1, ${a.date}::date, ${a.objet},
             ${a.montantXof}, ${a.delaiJ}, ${auteurId}::uuid
        from avenant where projet_id = ${projetId}::uuid
      returning numero`)
    await recompute(tx as unknown as Db, projetId)
    return Number(n?.numero)
  })
  if (a.figerReference) {
    await figerReference(db, projetId, `Avenant n° ${numero} : ${a.objet}`, auteurId)
  }
  return { numero }
}

export type NouvelOrdreService = {
  date: string
  type: TypeOrdreService
  objet: string
  delaiJ: number
}

export async function ajouterOrdreService(
  db: Db,
  projetId: string,
  o: NouvelOrdreService,
  auteurId: string,
): Promise<{ numero: number }> {
  if (o.type !== 'PROLONGATION' && o.delaiJ !== 0) {
    throw new RefusMetier(
      'INCOHERENT',
      'Seul un ordre de prolongation porte un nombre de jours ; un arrêt se clôt par une reprise.',
    )
  }
  return db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verrouillerProjet(tx, projetId)
    if (o.type === 'REPRISE') await exigerArretOuvert(tx, projetId, o.date)
    const [n] = await tx.execute<{ numero: number }>(sql`
      insert into ordre_service (projet_id, numero, date, type, objet, delai_j, cree_par_id)
      select ${projetId}::uuid, coalesce(max(numero), 0) + 1, ${o.date}::date,
             ${o.type}::type_ordre_service, ${o.objet}, ${o.delaiJ}, ${auteurId}::uuid
        from ordre_service where projet_id = ${projetId}::uuid
      returning numero`)
    await recompute(tx as unknown as Db, projetId)
    return { numero: Number(n?.numero) }
  })
}

/** Une reprise n'a de sens qu'apres un arret encore ouvert, et pas avant lui. */
async function exigerArretOuvert(tx: Transaction, projetId: string, date: string): Promise<void> {
  const [dernier] = await tx.execute<{ type: string; date: string }>(sql`
    select type::text as type, date from ordre_service
     where projet_id = ${projetId}::uuid and type in ('ARRET', 'REPRISE')
     order by date desc, numero desc limit 1`)
  if (!dernier || dernier.type !== 'ARRET') {
    throw new RefusMetier('INCOHERENT', 'Aucun ordre d’arrêt en cours : rien à reprendre.')
  }
  if (date < dernier.date) {
    throw new RefusMetier('INCOHERENT', 'La reprise ne peut pas précéder l’arrêt.')
  }
}

/**
 * Reconnait ou rejette une journee d'intemperie. Seule une intemperie
 * reconnue prolonge le delai, au-dela des journees previsibles du CCAP.
 */
export async function statuerIntemperie(
  db: Db,
  projetId: string,
  aleaId: string,
  decision: Exclude<DecisionIntemperie, 'PROPOSEE'>,
  auteurId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await poserAuteur(tx, auteurId)
    await verrouillerProjet(tx, projetId)
    const lignes = await tx.execute<{ id: string }>(sql`
      update alea set decision_intemperie = ${decision}::decision_intemperie,
                      statut = 'SOLDE', resolu_le = coalesce(resolu_le, date)
       where id = ${aleaId}::uuid and projet_id = ${projetId}::uuid and type = 'INTEMPERIE'
       returning id`)
    if (lignes.length === 0) throw new RefusMetier('INTROUVABLE', 'Intempérie introuvable.')
    await recompute(tx as unknown as Db, projetId)
  })
}

/**
 * Propose une intemperie pour chaque journee arretee par la meteo que le
 * journal valide constate, et qu'aucune intemperie ne couvre encore.
 *
 * Une journee d'intemperie est une journee du CHANTIER : plusieurs lots
 * arretes le meme jour donnent une seule proposition. Elle reste a
 * reconnaitre ; tant qu'elle ne l'est pas, elle ne prolonge rien.
 *
 * Une intemperie couvre de sa date a sa date de fin (resolu_le) : une serie
 * de six journees d'arret s'etale sur plus de six jours calendaires, les
 * dimanches et les journees seches intercalees comprises. Une proposition
 * porte sa propre date comme fin : elle couvre une seule journee.
 *
 * Idempotente : une journee deja couverte n'est jamais proposee deux fois.
 * Renvoie le nombre de propositions creees.
 */
export async function proposerIntemperies(tx: Transaction, projetId: string): Promise<number> {
  const lignes = await tx.execute<{ id: string }>(sql`
    insert into alea (projet_id, date, type, gravite, description, impact_delai_j,
                      impact_cout_xof, statut, resolu_le, decision_intemperie)
    select r.projet_id, r.date, 'INTEMPERIE', 2,
           'Journée arrêtée pour intempérie, constatée au journal : '
             || string_agg(distinct coalesce(r.motif_arret, 'intempérie'), ' ; ')
             || '. Proposée automatiquement, à reconnaître contradictoirement.',
           1, 0, 'OUVERT', r.date, 'PROPOSEE'
      from releve_journalier r
     where r.projet_id = ${projetId}::uuid and r.statut = 'VALIDE'
       and not r.journee_travaillee
       and (r.motif_arret ~* '(pluie|intemp|orage|vent|inond)'
            or coalesce(r.precipitations_mm, 0) >= 10)
       and not exists (
             select 1 from alea a
              where a.projet_id = r.projet_id and a.type = 'INTEMPERIE'
                and r.date between a.date
                               and coalesce(a.resolu_le, a.date + greatest(a.impact_delai_j, 1) - 1))
     group by r.projet_id, r.date
    returning id`)
  return lignes.length
}
