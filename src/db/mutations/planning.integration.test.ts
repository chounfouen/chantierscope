/**
 * Tests d'integration de l'edition du planning, sur la base dediee.
 *
 * Chaque cas remet le planning dans son etat initial : les autres suites
 * s'appuient sur le planning du jeu de demonstration.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { recaler } from '@/db/compute/planning'
import { dbScript } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import {
  ajouterLiaison,
  enregistrerScenario,
  modifierTachePlanning,
  supprimerLiaison,
  supprimerScenario,
} from '@/db/mutations/planning'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerPlanning, jourDuPlanning, reseauDuPlanning } from '@/db/queries/planning'
import { recompute } from '@/db/recompute'

const { db, client, fermer } = dbScript()
let projetId: string
let conducteurId: string

/** Empreinte des dates prevues, pour verifier un retour a l'identique. */
async function empreinteDates(): Promise<string> {
  const [e] = await client<{ e: string }[]>`
    select md5(string_agg(code_wbs || ':' || date_debut_prevue || ':' || date_fin_prevue || ':' ||
                          duree_prevue_j, '|' order by code_wbs)) as e from tache`
  return e?.e ?? ''
}

async function tache(code: string) {
  const [t] = await client<
    { id: string; debut: string; fin: string; duree: number; critique: boolean; marge: number }[]
  >`
    select id, to_char(date_debut_prevue, 'YYYY-MM-DD') as debut,
           to_char(date_fin_prevue, 'YYYY-MM-DD') as fin, duree_prevue_j as duree,
           critique, marge_totale_j as marge
      from tache where code_wbs = ${code}`
  if (!t) throw new Error(`Tache ${code} absente`)
  return t
}

async function attendreRefus(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(RefusMetier)
    return (e as Error).message
  }
  throw new Error('Refus attendu')
}

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const [c] = await client<{ id: string }[]>`select id from utilisateur where role = 'CONDUCTEUR'`
  conducteurId = c?.id as string
  await recompute(db, projetId)
})

afterAll(async () => {
  await fermer()
})

describe('le planning du jeu de demonstration', () => {
  it('est un point fixe du recalage : aucune date ne bouge a vide', async () => {
    const planning = await chargerPlanning(db, projetId)
    const { dates } = recaler(reseauDuPlanning(planning))
    const origine = planning.projet.dateOrdreService
    const ecarts = planning.taches
      .filter((t) => t.feuille)
      .filter((t) => {
        const d = dates.get(t.id)
        return (
          d?.debut !== jourDuPlanning(origine, t.dateDebutPrevue) ||
          d.fin !== jourDuPlanning(origine, t.dateFinPrevue)
        )
      })
      .map((t) => t.codeWbs)
    expect(ecarts).toEqual([])
  })
})

describe('modification d une tache', () => {
  /**
   * La tache retenue pilote son successeur par sa FIN (liaison fin-debut).
   * Une tache critique ne l'est pas forcement par sa fin : 03.1.2, dont le
   * seul successeur est lie debut-debut, a un debut critique et une fin
   * libre. L'allonger ne retarde rien, et c'est juste. La marge totale
   * retenue est la plus petite des deux, selon la convention usuelle.
   */
  it('allonger une tache critique par sa fin repousse sa suite et la fin du reseau', async () => {
    const initiale = await empreinteDates()
    const t = await tache('03.1.1')
    expect(t.critique).toBe(true)
    const avant = await chargerPlanning(db, projetId)
    const dureeAvant = recaler(reseauDuPlanning(avant)).resultat.dureeTotale

    const r = await modifierTachePlanning(db, projetId, t.id, { dureeJ: t.duree + 5 }, conducteurId)
    expect(r.dureeReseauJ).toBe(dureeAvant + 5)
    const apres = await tache('03.1.1')
    expect(apres.duree).toBe(t.duree + 5)
    expect(apres.debut).toBe(t.debut)

    // L'audit attribue la modification au conducteur.
    const [trace] = await client<{ auteur: string }[]>`
      select utilisateur_id as auteur from journal_audit
       where entite = 'tache' and entite_id = ${t.id}::uuid order by id desc limit 1`
    expect(trace?.auteur).toBe(conducteurId)

    await modifierTachePlanning(db, projetId, t.id, { dureeJ: t.duree }, conducteurId)
    expect(await empreinteDates()).toBe(initiale)
  })

  it('allonger une tache critique par son seul debut ne retarde pas la fin', async () => {
    const t = await tache('03.1.2')
    expect(t.critique).toBe(true)
    const avant = recaler(reseauDuPlanning(await chargerPlanning(db, projetId))).resultat
      .dureeTotale
    const r = await modifierTachePlanning(db, projetId, t.id, { dureeJ: t.duree + 5 }, conducteurId)
    expect(r.dureeReseauJ).toBe(avant)
    await modifierTachePlanning(db, projetId, t.id, { dureeJ: t.duree }, conducteurId)
  })

  it('allonger une tache dans sa marge ne repousse pas la fin', async () => {
    const [m] = await client<{ code: string; marge: number }[]>`
      select code_wbs as code, marge_totale_j as marge from tache
       where parent_id is not null and marge_totale_j >= 5 order by code_wbs limit 1`
    const t = await tache(m?.code as string)
    const avant = recaler(reseauDuPlanning(await chargerPlanning(db, projetId))).resultat
      .dureeTotale
    const r = await modifierTachePlanning(db, projetId, t.id, { dureeJ: t.duree + 2 }, conducteurId)
    expect(r.dureeReseauJ).toBe(avant)
    await modifierTachePlanning(db, projetId, t.id, { dureeJ: t.duree }, conducteurId)
  })

  it('une contrainte de debut plus tardive deplace la tache, et se retire', async () => {
    const initiale = await empreinteDates()
    const t = await tache('06.1.1')
    const nouvelle = '2026-09-01'
    const r = await modifierTachePlanning(
      db,
      projetId,
      t.id,
      { debutImpose: nouvelle },
      conducteurId,
    )
    expect(r.avertissement).toBeNull()
    expect((await tache('06.1.1')).debut).toBe(nouvelle)
    const [c] = await client<{ d: string }[]>`
      select to_char(debut_impose, 'YYYY-MM-DD') as d from tache where id = ${t.id}::uuid`
    expect(c?.d).toBe(nouvelle)

    await modifierTachePlanning(db, projetId, t.id, { debutImpose: null }, conducteurId)
    expect(await empreinteDates()).toBe(initiale)
  })

  it('une contrainte plus precoce que les predecesseurs est signalee sans effet', async () => {
    const t = await tache('04.4.1')
    const r = await modifierTachePlanning(
      db,
      projetId,
      t.id,
      { debutImpose: '2026-03-10' },
      conducteurId,
    )
    expect(r.avertissement).toMatch(/sans effet/)
    expect((await tache('04.4.1')).debut).toBe(t.debut)
    await modifierTachePlanning(db, projetId, t.id, { debutImpose: null }, conducteurId)
  })

  it('refuse une duree nulle et une date avant l ordre de service', async () => {
    const t = await tache('04.4.1')
    await attendreRefus(modifierTachePlanning(db, projetId, t.id, { dureeJ: 0 }, conducteurId))
    await attendreRefus(
      modifierTachePlanning(db, projetId, t.id, { debutImpose: '2025-01-01' }, conducteurId),
    )
  })

  it('refuse de modifier un regroupement de la WBS', async () => {
    const [n] = await client<{ id: string }[]>`select id from tache where parent_id is null limit 1`
    const m = await attendreRefus(
      modifierTachePlanning(db, projetId, n?.id as string, { dureeJ: 10 }, conducteurId),
    )
    expect(m).toMatch(/regroupement/)
  })

  it('un jalon contractuel garde sa date, un jalon interne suit sa tache', async () => {
    const jalons = await client<
      { nom: string; contractuel: boolean; date: string; tache: string }[]
    >`
      select j.nom, j.contractuel, to_char(j.date_prevue, 'YYYY-MM-DD') as date,
             j.tache_declenchante_id as tache
        from jalon j order by ordre`
    // Allonger la premiere tache critique repousse tous les jalons.
    const t = await tache('01.1.1')
    await modifierTachePlanning(db, projetId, t.id, { dureeJ: t.duree + 3 }, conducteurId)
    const apres = await client<{ nom: string; date: string }[]>`
      select nom, to_char(date_prevue, 'YYYY-MM-DD') as date from jalon order by ordre`
    for (const j of jalons) {
      const a = apres.find((x) => x.nom === j.nom)
      if (j.contractuel) expect(a?.date, j.nom).toBe(j.date)
      else expect(a?.date, j.nom).not.toBe(j.date)
    }
    await modifierTachePlanning(db, projetId, t.id, { dureeJ: t.duree }, conducteurId)
  })
})

describe('liaisons', () => {
  it('refuse une liaison qui ferme un circuit, en nommant les taches', async () => {
    const amont = await tache('08.1.3')
    const aval = await tache('03.1.1')
    const [avant] = await client<{ n: number }[]>`select count(*)::int as n from liaison`
    const m = await attendreRefus(
      ajouterLiaison(
        db,
        projetId,
        { amontId: amont.id, avalId: aval.id, type: 'FD', decalageJ: 0 },
        conducteurId,
      ),
    )
    expect(m).toMatch(/circuit/)
    expect(m).toMatch(/08\.1\.3/)
    expect(m).toMatch(/03\.1\.1/)
    const [apres] = await client<{ n: number }[]>`select count(*)::int as n from liaison`
    expect(apres?.n).toBe(avant?.n)
  })

  it('refuse un doublon entre deux taches deja liees', async () => {
    const [l] = await client<{ amont: string; aval: string }[]>`
      select tache_amont_id as amont, tache_aval_id as aval from liaison limit 1`
    const m = await attendreRefus(
      ajouterLiaison(
        db,
        projetId,
        { amontId: l?.amont as string, avalId: l?.aval as string, type: 'DD', decalageJ: 0 },
        conducteurId,
      ),
    )
    expect(m).toMatch(/déjà liées/)
  })

  it('ajouter puis supprimer une liaison rend le planning a l identique, avec audit', async () => {
    const initiale = await empreinteDates()
    // Une liaison qui retarde : la serrurerie attend la fin du carrelage,
    // avec dix jours de decalage.
    const amont = await tache('06.1.5')
    const aval = await tache('06.2.3')
    const r = await ajouterLiaison(
      db,
      projetId,
      { amontId: amont.id, avalId: aval.id, type: 'FD', decalageJ: 10 },
      conducteurId,
    )
    expect(await empreinteDates()).not.toBe(initiale)

    const [trace] = await client<{ action: string; auteur: string }[]>`
      select action, utilisateur_id as auteur from journal_audit
       where entite = 'liaison' and entite_id = ${r.liaisonId}::uuid`
    expect(trace).toEqual({ action: 'INSERT', auteur: conducteurId })

    await supprimerLiaison(db, projetId, r.liaisonId, conducteurId)
    expect(await empreinteDates()).toBe(initiale)
  })

  it('refuse de supprimer une liaison inconnue', async () => {
    await attendreRefus(
      supprimerLiaison(db, projetId, '00000000-0000-4000-8000-000000000000', conducteurId),
    )
  })
})

describe('scenarios de simulation', () => {
  it('enregistre les hypotheses, et seulement elles', async () => {
    const t = await tache('03.1.1')
    const { id } = await enregistrerScenario(
      db,
      projetId,
      {
        nom: 'Fondations : dix jours de glissement',
        description: null,
        perturbations: [{ tacheId: t.id, decalageJ: 10, allongementJ: 0 }],
      },
      conducteurId,
    )
    const [s] = await client<{ p: unknown }[]>`
      select perturbations as p from scenario_simulation where id = ${id}::uuid`
    expect(s?.p).toEqual([{ tacheId: t.id, decalageJ: 10, allongementJ: 0 }])
    await supprimerScenario(db, projetId, id)
    expect(await client`select 1 from scenario_simulation where id = ${id}::uuid`).toHaveLength(0)
  })

  it('refuse un scenario vide ou portant sur une tache etrangere', async () => {
    await attendreRefus(
      enregistrerScenario(
        db,
        projetId,
        { nom: 'Vide', description: null, perturbations: [] },
        conducteurId,
      ),
    )
    await attendreRefus(
      enregistrerScenario(
        db,
        projetId,
        {
          nom: 'Etranger',
          description: null,
          perturbations: [
            { tacheId: '00000000-0000-4000-8000-000000000000', decalageJ: 1, allongementJ: 0 },
          ],
        },
        conducteurId,
      ),
    )
  })
})
