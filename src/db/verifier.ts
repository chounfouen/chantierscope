/**
 * Verification de coherence de la base.
 *
 * Ce script est le critere d'achevement du sprint 1 : un jeu de donnees qui
 * ne le passe pas n'est pas exploitable, et toute la suite du projet
 * s'appuierait sur du sable.
 *
 * Il ne verifie pas que les donnees sont belles, mais qu'elles sont
 * COHERENTES : que les budgets s'emboitent exactement, que le reseau de
 * liaisons est acyclique, que le planning de reference respecte ses propres
 * dependances, que rien n'est orphelin, et que les declencheurs d'audit sont
 * en place.
 *
 *   npm run db:check
 */

import { dbScript } from '@/db/index'

type Resultat = { intitule: string; ok: boolean; detail: string }

const resultats: Resultat[] = []

function verifier(intitule: string, ok: boolean, detail = ''): void {
  resultats.push({ intitule, ok, detail })
}

async function main(): Promise<void> {
  const { client, fermer } = dbScript()

  try {
    /* --- Volumetrie ------------------------------------------------------- */

    const comptes = await client<{ table: string; n: number }[]>`
      select 'projet' as table, count(*)::int as n from projet
      union all select 'lot', count(*)::int from lot
      union all select 'tache', count(*)::int from tache
      union all select 'liaison', count(*)::int from liaison
      union all select 'ligne_quantitatif', count(*)::int from ligne_quantitatif
      union all select 'releve_journalier', count(*)::int from releve_journalier
      union all select 'releve_quantite', count(*)::int from releve_quantite
      union all select 'jalon', count(*)::int from jalon
      union all select 'alea', count(*)::int from alea
      union all select 'zone', count(*)::int from zone
      union all select 'zone_tache', count(*)::int from zone_tache
      union all select 'photo', count(*)::int from photo
      union all select 'point_de_vue', count(*)::int from point_de_vue
      union all select 'ressource', count(*)::int from ressource
      union all select 'affectation', count(*)::int from affectation
      union all select 'utilisateur', count(*)::int from utilisateur
      union all select 'acces_projet', count(*)::int from acces_projet
      union all select 'snapshot_avancement', count(*)::int from snapshot_avancement
      union all select 'journal_audit', count(*)::int from journal_audit
      order by 1`

    console.log('Volumetrie')
    for (const c of comptes) console.log(`  ${c.table.padEnd(22)} ${String(c.n).padStart(6)}`)
    console.log()

    const nonVides = ['projet', 'lot', 'tache', 'liaison', 'ligne_quantitatif', 'releve_journalier']
    for (const table of nonVides) {
      const n = comptes.find((c) => c.table === table)?.n ?? 0
      verifier(`Table ${table} non vide`, n > 0, `${n} lignes`)
    }

    /* --- Emboitement des budgets ------------------------------------------ */

    const [budgets] = await client<{ marche: number; lots: number }[]>`
      select p.montant_marche_xof::bigint as marche,
             (select coalesce(sum(budget_xof), 0) from lot where projet_id = p.id)::bigint as lots
      from projet p`
    verifier(
      'Somme des budgets de lots egale le montant du marche',
      Number(budgets?.marche) === Number(budgets?.lots),
      `marche ${budgets?.marche} / lots ${budgets?.lots}`,
    )

    const ecartsLot = await client<{ code: string; ecart: number }[]>`
      select l.code, (l.budget_xof - coalesce(sum(t.poids_budgetaire_xof), 0))::bigint as ecart
      from lot l
      left join tache t on t.lot_id = l.id and t.parent_id is not null
      group by l.id, l.code, l.budget_xof
      having l.budget_xof <> coalesce(sum(t.poids_budgetaire_xof), 0)`
    verifier(
      'Budget de chaque lot egale la somme de ses taches feuilles',
      ecartsLot.length === 0,
      ecartsLot.map((e) => `${e.code}: ${e.ecart}`).join(', '),
    )

    const ecartsTache = await client<{ code: string; ecart: number }[]>`
      select t.code_wbs as code,
             (t.poids_budgetaire_xof - coalesce(sum(q.montant_xof), 0))::bigint as ecart
      from tache t
      join ligne_quantitatif q on q.tache_id = t.id
      group by t.id, t.code_wbs, t.poids_budgetaire_xof
      having t.poids_budgetaire_xof <> coalesce(sum(q.montant_xof), 0)`
    verifier(
      'Poids budgetaire de chaque tache egale la somme de son quantitatif',
      ecartsTache.length === 0,
      ecartsTache.map((e) => `${e.code}: ${e.ecart}`).join(', '),
    )

    /* --- Structure de la WBS ----------------------------------------------- */

    const feuillesSansQuantitatif = await client<{ code: string }[]>`
      select t.code_wbs as code from tache t
      where t.parent_id is not null
        and not exists (select 1 from ligne_quantitatif q where q.tache_id = t.id)`
    verifier(
      'Chaque tache feuille porte au moins une ligne de quantitatif',
      feuillesSansQuantitatif.length === 0,
      feuillesSansQuantitatif.map((f) => f.code).join(', '),
    )

    const noeudsSansEnfant = await client<{ code: string }[]>`
      select t.code_wbs as code from tache t
      where t.parent_id is null
        and not exists (select 1 from tache e where e.parent_id = t.id)`
    verifier(
      'Chaque noeud de WBS a au moins un enfant',
      noeudsSansEnfant.length === 0,
      noeudsSansEnfant.map((n) => n.code).join(', '),
    )

    const noeudsHorsLot = await client<{ code: string }[]>`
      select e.code_wbs as code from tache e
      join tache p on p.id = e.parent_id
      where e.lot_id <> p.lot_id`
    verifier(
      'Aucune tache rattachee a un parent d un autre lot',
      noeudsHorsLot.length === 0,
      noeudsHorsLot.map((n) => n.code).join(', '),
    )

    /* --- Reseau de liaisons ------------------------------------------------ */

    const [cycles] = await client<{ n: number }[]>`
      with recursive chemin(depart, courant, profondeur, boucle) as (
        select tache_amont_id, tache_aval_id, 1, false from liaison
        union all
        select c.depart, l.tache_aval_id, c.profondeur + 1, c.depart = l.tache_aval_id
        from chemin c
        join liaison l on l.tache_amont_id = c.courant
        where not c.boucle and c.profondeur < 200
      )
      select count(*)::int as n from chemin where boucle`
    verifier('Reseau de liaisons acyclique', Number(cycles?.n) === 0, `${cycles?.n} boucles`)

    const liaisonsIncoherentes = await client<{ amont: string; aval: string; type: string }[]>`
      select a.code_wbs as amont, b.code_wbs as aval, l.type::text as type
      from liaison l
      join tache a on a.id = l.tache_amont_id
      join tache b on b.id = l.tache_aval_id
      where (l.type = 'FD' and b.date_debut_prevue < a.date_fin_prevue + 1 + l.decalage_j)
         or (l.type = 'DD' and b.date_debut_prevue < a.date_debut_prevue + l.decalage_j)`
    verifier(
      'Le planning de reference respecte toutes ses liaisons',
      liaisonsIncoherentes.length === 0,
      liaisonsIncoherentes.map((l) => `${l.amont}->${l.aval} (${l.type})`).join(', '),
    )

    const dureesIncoherentes = await client<{ code: string }[]>`
      select code_wbs as code from tache
      where date_fin_prevue - date_debut_prevue + 1 <> duree_prevue_j`
    verifier(
      'Duree de chaque tache coherente avec ses dates',
      dureesIncoherentes.length === 0,
      dureesIncoherentes.map((d) => d.code).join(', '),
    )

    /* --- Releves ------------------------------------------------------------ */

    const validesSansValidateur = await client<{ n: number }[]>`
      select count(*)::int as n from releve_journalier
      where statut = 'VALIDE' and (valide_par_id is null or valide_le is null)`
    verifier(
      'Tout releve valide porte son validateur et son horodatage',
      Number(validesSansValidateur[0]?.n) === 0,
    )

    const relevesHorsPeriode = await client<{ n: number }[]>`
      select count(*)::int as n from releve_journalier r
      join projet p on p.id = r.projet_id
      where r.date < p.date_ordre_service`
    verifier('Aucun releve anterieur a l ordre de service', Number(relevesHorsPeriode[0]?.n) === 0)

    const doublons = await client<{ n: number }[]>`
      select count(*)::int as n from (
        select lot_id, date from releve_journalier
        where statut <> 'RECTIFIE'
        group by lot_id, date having count(*) > 1
      ) d`
    verifier('Un seul releve actif par lot et par jour', Number(doublons[0]?.n) === 0)

    const arretsSansMotif = await client<{ n: number }[]>`
      select count(*)::int as n from releve_journalier
      where journee_travaillee = false and motif_arret is null`
    verifier('Toute journee non travaillee porte sa cause', Number(arretsSansMotif[0]?.n) === 0)

    /* --- Quantites ----------------------------------------------------------- */

    const depassements = await client<{ code: string; prevu: number; realise: number }[]>`
      select t.code_wbs as code, q.quantite_prevue::float8 as prevu,
             sum(r.quantite_realisee)::float8 as realise
      from releve_quantite r
      join ligne_quantitatif q on q.id = r.ligne_quantitatif_id
      join tache t on t.id = q.tache_id
      group by q.id, t.code_wbs, q.quantite_prevue
      having sum(r.quantite_realisee) > q.quantite_prevue * 1.001`
    verifier(
      'Aucun cumul de quantite ne depasse le prevu',
      depassements.length === 0,
      depassements.map((d) => `${d.code}: ${d.realise} > ${d.prevu}`).join(', '),
    )

    const [couverture] = await client<{ lignes: number; entamees: number }[]>`
      select count(*)::int as lignes,
             count(*) filter (where exists (
               select 1 from releve_quantite r where r.ligne_quantitatif_id = q.id
             ))::int as entamees
      from ligne_quantitatif q`
    verifier(
      'Une part significative du quantitatif est entamee',
      Number(couverture?.entamees) > Number(couverture?.lignes) * 0.3,
      `${couverture?.entamees} lignes entamees sur ${couverture?.lignes}`,
    )

    /* --- Coherence entre dates reelles et releves ------------------------------ */

    const datesReellesIncoherentes = await client<{ code: string }[]>`
      select code_wbs as code from tache
      where date_debut_reelle is not null
        and date_fin_reelle is not null
        and date_fin_reelle < date_debut_reelle`
    verifier(
      'Dates reelles coherentes entre elles',
      datesReellesIncoherentes.length === 0,
      datesReellesIncoherentes.map((d) => d.code).join(', '),
    )

    /* --- Jalons et aleas --------------------------------------------------------- */

    const jalonsSansDeclencheur = await client<{ n: number }[]>`
      select count(*)::int as n from jalon where tache_declenchante_id is null`
    verifier('Chaque jalon a sa tache declenchante', Number(jalonsSansDeclencheur[0]?.n) === 0)

    const [typesAlea] = await client<{ n: number }[]>`
      select count(distinct type)::int as n from alea`
    verifier(
      'Au moins trois types d alea sont representes',
      Number(typesAlea?.n) >= 3,
      `${typesAlea?.n} types`,
    )

    /* --- Cache recalculable ---------------------------------------------------- */

    const [instantanes] = await client<{ n: number }[]>`
      select count(*)::int as n from snapshot_avancement`
    if (Number(instantanes?.n) > 0) {
      const desagregations = await client<{ date: string }[]>`
        select date from snapshot_avancement
         group by date
        having max(case when lot_id is null then valeur_acquise_xof end)
               <> sum(case when lot_id is not null then valeur_acquise_xof else 0 end)`
      verifier(
        'La valeur acquise du projet egale la somme de celle des lots',
        desagregations.length === 0,
        `${desagregations.length} journees incoherentes`,
      )

      const regressions = await client<{ n: number }[]>`
        select count(*)::int as n from (
          select valeur_acquise_xof as v,
                 lag(valeur_acquise_xof) over (partition by lot_id order by date) as precedent
            from snapshot_avancement
        ) c where precedent is not null and v < precedent`
      verifier('La valeur acquise ne decroit jamais dans le temps', Number(regressions[0]?.n) === 0)

      const [marges] = await client<{ n: number }[]>`
        select count(*)::int as n from tache
         where parent_id is not null and (marge_totale_j is null or marge_totale_j < 0)`
      verifier(
        'Chaque tache feuille porte une marge totale positive ou nulle',
        Number(marges?.n) === 0,
      )

      const [critiques] = await client<{ n: number }[]>`
        select count(*)::int as n from tache where critique and marge_totale_j <> 0`
      verifier('Aucune tache critique ne porte de marge', Number(critiques?.n) === 0)
    } else {
      console.log('Cache vide : lancer npm run db:recalcul pour le verifier aussi.')
      console.log()
    }

    /* --- Audit --------------------------------------------------------------------- */

    const declencheurs = await client<{ n: number }[]>`
      select count(*)::int as n from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal
        and c.relname in ('releve_journalier','releve_quantite','ligne_quantitatif','tache')
        and t.tgenabled <> 'D'`
    verifier(
      'Les declencheurs d audit sont en place et actifs',
      Number(declencheurs[0]?.n) >= 5,
      `${declencheurs[0]?.n} declencheurs actifs`,
    )

    /* --- Rendu --------------------------------------------------------------------- */

    console.log('Verifications')
    let echecs = 0
    for (const r of resultats) {
      const marque = r.ok ? '  OK  ' : ' ECHEC'
      console.log(`${marque}  ${r.intitule}${r.detail ? `  [${r.detail}]` : ''}`)
      if (!r.ok) echecs++
    }
    console.log()
    if (echecs === 0) {
      console.log(`${resultats.length} verifications, aucun echec.`)
    } else {
      console.log(`${echecs} echec(s) sur ${resultats.length} verifications.`)
      process.exitCode = 1
    }
  } finally {
    await fermer()
  }
}

main().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})
