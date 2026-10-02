/**
 * Tests d'integration du recalcul, sur la base dediee.
 *
 * Le test central est celui de COHERENCE DU CACHE : un recalcul incremental,
 * declenche par la validation d'un releve, doit produire exactement le meme
 * cache qu'un recalcul integral reparti de zero. Tant qu'il passe,
 * l'invariant de la conception tient : aucune incoherence n'est definitive.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { premierProjetId } from '@/db/queries/contexte'
import { COUT } from '@/db/compute/evm'
import { recompute } from '@/db/recompute'
import { recalculerProjet, validerReleve } from '@/db/mutations/releve'

const { db, client, fermer } = dbScript()

/** Date d'analyse figee : le jeu de demonstration s'arrete la. */
const DATE_ANALYSE = '2026-09-30'

let projetId: string

beforeAll(async () => {
  projetId = await premierProjetId(db)
})

afterAll(async () => {
  await fermer()
})

/** Empreinte du cache, pour comparer deux etats sans les enumerer. */
async function empreinteCache(): Promise<{ taches: string; instantanes: string }> {
  const [t] = await client<{ e: string }[]>`
    select md5(string_agg(
      code_wbs || ':' || avancement_pct || ':' || poids_budgetaire_xof || ':' ||
      coalesce(marge_libre_j::text, '-') || ':' || coalesce(marge_totale_j::text, '-') || ':' ||
      critique, '|' order by code_wbs)) as e
    from tache`
  const [s] = await client<{ e: string }[]>`
    select md5(string_agg(
      coalesce(lot_id::text, 'projet') || ':' || date || ':' || avancement_pct || ':' ||
      valeur_planifiee_xof || ':' || valeur_acquise_xof || ':' || cout_reel_xof, '|'
      order by coalesce(lot_id::text, 'projet'), date)) as e
    from snapshot_avancement`
  return { taches: t?.e ?? '', instantanes: s?.e ?? '' }
}

describe('recalcul integral', () => {
  it('s execute sur le projet de demonstration', async () => {
    const r = await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    expect(r.taches).toBe(76)
    expect(r.instantanes).toBe(213 * 9) // 213 journees, 8 lots plus le consolide
  })

  it('reste sous deux secondes', async () => {
    const r = await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    expect(r.dureeMs).toBeLessThan(2000)
  })

  it('produit un avancement coherent avec la situation attendue', async () => {
    const r = await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    // Situation de reference etablie au sprint 1 : environ 45 % realises pour
    // 50 % planifies. Les bornes sont larges : le test protege contre une
    // erreur de calcul, pas contre une variation de calage du peuplement.
    expect(r.avancement).toBeGreaterThan(0.38)
    expect(r.avancement).toBeLessThan(0.5)
    expect(r.valeurAcquiseXof).toBeLessThan(r.valeurPlanifieeXof)
  })

  it('produit un SPI en zone d alerte et un ecart de delai en jours', async () => {
    const r = await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    expect(r.spi).not.toBeNull()
    expect(r.spi as number).toBeGreaterThan(0.8)
    expect(r.spi as number).toBeLessThan(1)
    expect(r.ecartDelaiJ).toBeGreaterThan(5)
    expect(r.ecartDelaiJ).toBeLessThan(40)
  })

  it('produit un CPI plausible', async () => {
    const r = await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    expect(r.cpi).not.toBeNull()
    expect(r.cpi as number).toBeGreaterThan(0.7)
    expect(r.cpi as number).toBeLessThan(1.3)
  })
})

describe('idempotence', () => {
  it('deux recalculs consecutifs produisent un cache identique', async () => {
    await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    const premier = await empreinteCache()
    await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    const second = await empreinteCache()
    expect(second).toEqual(premier)
  })

  it('ne laisse aucun instantane en double', async () => {
    await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    const doublons = await client<{ n: number }[]>`
      select count(*)::int as n from (
        select projet_id, lot_id, date from snapshot_avancement
        group by 1, 2, 3 having count(*) > 1
      ) d`
    expect(Number(doublons[0]?.n)).toBe(0)
  })
})

describe('coherence des agregats', () => {
  it('la somme des valeurs acquises des lots egale celle du projet', async () => {
    await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    const ecarts = await client<{ date: string; ecart: number }[]>`
      select s.date,
             (max(case when s.lot_id is null then s.valeur_acquise_xof end)
              - sum(case when s.lot_id is not null then s.valeur_acquise_xof else 0 end))::float8
             as ecart
        from snapshot_avancement s
       group by s.date
      having max(case when s.lot_id is null then s.valeur_acquise_xof end)
             <> sum(case when s.lot_id is not null then s.valeur_acquise_xof else 0 end)`
    expect(ecarts).toEqual([])
  })

  /**
   * Non-regression : un alea rattache a un lot etait compte dans le cout du
   * lot ET ajoute une seconde fois au cout du projet.
   */
  it('le cout reel du projet est la somme des lots, des frais et des seuls aleas sans lot', async () => {
    await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    const [r] = await client<{ projet: number; lots: number; jours: number; sansLot: number }[]>`
      select
        (select cout_reel_xof from snapshot_avancement
          where lot_id is null and date = ${DATE_ANALYSE}::date)::float8 as projet,
        (select sum(cout_reel_xof) from snapshot_avancement
          where lot_id is not null and date = ${DATE_ANALYSE}::date)::float8 as lots,
        (${DATE_ANALYSE}::date - (select date_ordre_service from projet limit 1) + 1)::int as jours,
        (select coalesce(sum(impact_cout_xof), 0) from alea
          where lot_id is null and date <= ${DATE_ANALYSE}::date)::float8 as "sansLot"`
    expect(r?.projet).toBe(
      Number(r?.lots) + Number(r?.jours) * COUT.fraisChantierJour + Number(r?.sansLot),
    )
  })

  it('la valeur acquise ne decroit jamais dans le temps', async () => {
    const decroissances = await client<{ n: number }[]>`
      select count(*)::int as n from (
        select valeur_acquise_xof as v,
               lag(valeur_acquise_xof) over (partition by lot_id order by date) as precedent
          from snapshot_avancement where lot_id is null
      ) c where precedent is not null and v < precedent`
    expect(Number(decroissances[0]?.n)).toBe(0)
  })

  it('la valeur planifiee ne decroit jamais dans le temps', async () => {
    const decroissances = await client<{ n: number }[]>`
      select count(*)::int as n from (
        select valeur_planifiee_xof as v,
               lag(valeur_planifiee_xof) over (partition by lot_id order by date) as precedent
          from snapshot_avancement where lot_id is null
      ) c where precedent is not null and v < precedent`
    expect(Number(decroissances[0]?.n)).toBe(0)
  })

  it('aucune valeur acquise ne depasse le budget de son lot', async () => {
    const depassements = await client<{ code: string }[]>`
      select l.code from snapshot_avancement s
      join lot l on l.id = s.lot_id
      where s.valeur_acquise_xof > l.budget_xof
      group by l.code`
    expect(depassements).toEqual([])
  })

  it('l avancement de chaque tache reste entre zero et un', async () => {
    const hors = await client<{ n: number }[]>`
      select count(*)::int as n from tache where avancement_pct < 0 or avancement_pct > 1`
    expect(Number(hors[0]?.n)).toBe(0)
  })

  it('le poids budgetaire des feuilles egale leur quantitatif', async () => {
    const ecarts = await client<{ code: string }[]>`
      select t.code_wbs as code from tache t
      join ligne_quantitatif q on q.tache_id = t.id
      group by t.id, t.code_wbs, t.poids_budgetaire_xof
      having t.poids_budgetaire_xof <> sum(q.montant_xof)`
    expect(ecarts).toEqual([])
  })

  /**
   * Non-regression sur un defaut reel.
   *
   * Une premiere version sommait directement les quantites plafonnees pour
   * batir l'instantane, ce qui revenait a traiter toutes les taches en unites
   * physiques. Les quatre taches en jalons ponderes ou en tout ou rien
   * etaient alors valorisees differemment selon qu'on lisait le tableau de
   * bord ou la vue du lot, avec un ecart de 3,6 millions de FCFA.
   */
  it('la valeur acquise de l instantane honore la methode d avancement de chaque tache', async () => {
    await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })

    const [parTache] = await client<{ v: number }[]>`
      select round(sum(avancement_pct * poids_budgetaire_xof))::float8 as v
        from tache where parent_id is not null`
    const [instantane] = await client<{ v: number }[]>`
      select valeur_acquise_xof::float8 as v from snapshot_avancement
       where lot_id is null and date = ${DATE_ANALYSE}::date`

    // Tolerance d'un FCFA par tache, les arrondis n'etant pas faits au meme
    // niveau d'agregation.
    expect(Math.abs(Number(parTache?.v) - Number(instantane?.v))).toBeLessThan(80)
  })

  it('des methodes autres que les unites physiques sont bien representees', async () => {
    // Le test precedent n'aurait aucune portee si toutes les taches
    // employaient la meme methode.
    const [n] = await client<{ n: number }[]>`
      select count(*)::int as n from tache
       where parent_id is not null and methode_avancement <> 'UNITES_PHYSIQUES'`
    expect(Number(n?.n)).toBeGreaterThanOrEqual(3)
  })

  it('le chemin critique est identifie sur les taches feuilles', async () => {
    const [c] = await client<{ n: number }[]>`
      select count(*)::int as n from tache where critique and parent_id is not null`
    expect(Number(c?.n)).toBeGreaterThan(8)
  })
})

describe('validation d un releve', () => {
  it('valide un releve soumis et renvoie un recalcul', async () => {
    const [releve] = await client<{ id: string }[]>`
      select id from releve_journalier where statut = 'SOUMIS' order by date limit 1`
    const [conducteur] = await client<{ id: string }[]>`
      select id from utilisateur where role = 'CONDUCTEUR' limit 1`

    const r = await validerReleve(db, releve?.id as string, conducteur?.id as string)
    expect(r.modifie).toBe(true)
    expect(r.recalcul).not.toBeNull()
  })

  it('un second appel ne modifie rien', async () => {
    const [releve] = await client<{ id: string }[]>`
      select id from releve_journalier where statut = 'SOUMIS' order by date limit 1`
    const [conducteur] = await client<{ id: string }[]>`
      select id from utilisateur where role = 'CONDUCTEUR' limit 1`

    const premier = await validerReleve(db, releve?.id as string, conducteur?.id as string)
    expect(premier.modifie).toBe(true)
    const second = await validerReleve(db, releve?.id as string, conducteur?.id as string)
    expect(second.modifie).toBe(false)
    expect(second.recalcul).toBeNull()
  })

  it('refuse de valider un brouillon sans soumission prealable', async () => {
    const [releve] = await client<{ id: string }[]>`
      select id from releve_journalier where statut = 'BROUILLON' limit 1`
    const [conducteur] = await client<{ id: string }[]>`
      select id from utilisateur where role = 'CONDUCTEUR' limit 1`
    if (!releve) return
    await expect(validerReleve(db, releve.id, conducteur?.id as string)).rejects.toThrow(/soumis/)
  })

  it('inscrit l action au journal d audit, attribuee au validateur', async () => {
    const [releve] = await client<{ id: string }[]>`
      select id from releve_journalier where statut = 'SOUMIS' order by date limit 1`
    const [conducteur] = await client<{ id: string }[]>`
      select id from utilisateur where role = 'CONDUCTEUR' limit 1`
    if (!releve) return

    await validerReleve(db, releve.id, conducteur?.id as string)

    const [trace] = await client<{ action: string; avant: string; apres: string; role: string }[]>`
      select a.action, a.avant->>'statut' as avant, a.apres->>'statut' as apres, u.role::text as role
        from journal_audit a
        join utilisateur u on u.id = a.utilisateur_id
       where a.entite = 'releve_journalier' and a.entite_id = ${releve.id}::uuid
       order by a.id desc limit 1`
    expect(trace?.action).toBe('UPDATE')
    expect(trace?.avant).toBe('SOUMIS')
    expect(trace?.apres).toBe('VALIDE')
    expect(trace?.role).toBe('CONDUCTEUR')
  })
})

/**
 * Le test qui protege l'invariant de la conception.
 */
describe('coherence du cache : incremental contre integral', () => {
  it('valider un releve produit le meme cache qu un recalcul reparti de zero', async () => {
    const [conducteur] = await client<{ id: string }[]>`
      select id from utilisateur where role = 'CONDUCTEUR' limit 1`

    // Etat de depart propre.
    await recalculerProjet(db, projetId, conducteur?.id as string)

    // Le jeu de demonstration laisse six releves soumis ; les cas precedents
    // en consomment quatre. Un releve valide ne peut pas etre remis a l'etat
    // soumis : la base le refuse, c'est le gel.
    const [aValider] = await client<{ id: string }[]>`
      select id from releve_journalier where statut = 'SOUMIS' order by date limit 1`
    expect(aValider).toBeDefined()

    // Chemin incremental : validation, qui declenche le recalcul.
    const validation = await validerReleve(db, aValider?.id as string, conducteur?.id as string)
    expect(validation.recalcul).not.toBeNull()
    const incrementalRecalcul = validation.recalcul as NonNullable<typeof validation.recalcul>
    const incremental = await empreinteCache()

    // Chemin integral : on efface tout le cache et on repart de zero.
    await client`update tache set avancement_pct = 0, poids_budgetaire_xof = 0,
                                   marge_libre_j = null, marge_totale_j = null, critique = false`
    await client`delete from snapshot_avancement`
    // Meme date d'analyse que le chemin incremental, qui recalcule a la date
    // du jour. Figer ici une date differente ferait comparer deux plages
    // d'instantanes distinctes : le test ne passerait que le jour ou la date
    // figee coincide avec la date courante.
    await recompute(db, projetId, { dateAnalyse: incrementalRecalcul.dateAnalyse })
    const integral = await empreinteCache()

    expect(integral).toEqual(incremental)
  })

  it('le cache detruit se reconstruit a l identique', async () => {
    await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    const avant = await empreinteCache()

    await client`update tache set avancement_pct = 0.5, poids_budgetaire_xof = 1,
                                   marge_libre_j = 99, marge_totale_j = 99, critique = true`
    await client`delete from snapshot_avancement`

    await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    expect(await empreinteCache()).toEqual(avant)
  })
})

describe('date d analyse', () => {
  it('est bornee a la fin contractuelle', async () => {
    const r = await recompute(db, projetId, { dateAnalyse: '2099-01-01' })
    const [projet] = await client<{ fin: string }[]>`
      select date_fin_contractuelle as fin from projet where id = ${projetId}::uuid`
    expect(r.dateAnalyse).toBe(projet?.fin)
  })

  it('est bornee a l ordre de service', async () => {
    const r = await recompute(db, projetId, { dateAnalyse: '2000-01-01' })
    const [projet] = await client<{ os: string }[]>`
      select date_ordre_service as os from projet where id = ${projetId}::uuid`
    expect(r.dateAnalyse).toBe(projet?.os)
    expect(r.instantanes).toBe(9) // une seule journee, huit lots plus le consolide
  })

  it('une date anterieure produit un avancement inferieur', async () => {
    const tot = await recompute(db, projetId, { dateAnalyse: '2026-06-30' })
    const tard = await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    expect(tot.avancement).toBeLessThan(tard.avancement)
    expect(tot.valeurAcquiseXof).toBeLessThan(tard.valeurAcquiseXof)
  })

  it('remet la base dans son etat de reference', async () => {
    const r = await recompute(db, projetId, { dateAnalyse: DATE_ANALYSE })
    expect(r.dateAnalyse).toBe(DATE_ANALYSE)
  })
})
