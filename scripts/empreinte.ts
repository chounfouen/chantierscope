/**
 * Empreinte du jeu de donnees, independante des identifiants.
 *
 * Deux peuplements successifs doivent produire la meme empreinte. Les UUID et
 * les horodatages de creation sont tires par PostgreSQL et changent a chaque
 * execution : ils sont donc exclus. Ce qui est compare, ce sont les donnees
 * metier, ordonnees par leurs cles naturelles.
 */

import { dbScript } from '@/db/index'

const { client, fermer } = dbScript()

const [e] = await client<{ empreinte: string }[]>`
  select md5(string_agg(ligne, '|' order by ligne)) as empreinte from (
    select 'P:' || code || montant_marche_xof || duree_contractuelle_j || date_ordre_service as ligne
      from projet
    union all
    select 'L:' || code || budget_xof || rang_couleur from lot
    union all
    select 'T:' || code_wbs || nature || date_debut_prevue || date_fin_prevue || duree_prevue_j
           || coalesce(date_debut_reelle::text,'-') || coalesce(date_fin_reelle::text,'-')
           || poids_budgetaire_xof
      from tache
    union all
    select 'Q:' || t.code_wbs || q.designation || q.unite || q.quantite_prevue || q.prix_unitaire_xof
      from ligne_quantitatif q join tache t on t.id = q.tache_id
    union all
    select 'R:' || l.code || r.date || r.effectif_ouvriers || r.heures_travaillees
           || r.journee_travaillee || r.statut
      from releve_journalier r join lot l on l.id = r.lot_id
    union all
    select 'RQ:' || t.code_wbs || q.designation || r.date || rq.quantite_realisee
      from releve_quantite rq
      join releve_journalier r on r.id = rq.releve_journalier_id
      join ligne_quantitatif q on q.id = rq.ligne_quantitatif_id
      join tache t on t.id = q.tache_id
    union all
    select 'A:' || date || type || gravite || impact_delai_j || impact_cout_xof from alea
    union all
    select 'J:' || nom || date_prevue || coalesce(date_reelle::text,'-') from jalon
  ) lignes`

console.log(e?.empreinte ?? 'vide')
await fermer()
