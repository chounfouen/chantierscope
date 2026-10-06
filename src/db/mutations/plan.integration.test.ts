/**
 * Tests d'integration des ecritures du plan, sur la base dediee.
 *
 * Chaque cas remet les zones du jeu de demonstration dans leur etat
 * initial : le parcours de bout en bout et la lecture du plan s'y appuient.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { enregistrerPlan, enregistrerZone, retirerPlan, supprimerZone } from '@/db/mutations/plan'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerPlan } from '@/db/queries/plan'

const { db, client, fermer } = dbScript()
let projetId: string
let conducteurId: string

async function attendreRefus(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(RefusMetier)
    return (e as Error).message
  }
  throw new Error('Refus attendu')
}

async function contours(niveau: number): Promise<string[]> {
  const r = await client<{ p: string }[]>`
    select path_svg as p from zone where projet_id = ${projetId} and niveau = ${niveau} order by nom`
  return r.map((x) => x.p)
}

async function tacheFeuille(code: string): Promise<string> {
  const [t] = await client<{ id: string }[]>`select id from tache where code_wbs = ${code}`
  return t?.id as string
}

const PLAN = {
  chemin: 'projets/x/plans/essai.webp',
  largeur: 2200,
  hauteur: 1400,
  octets: 1000,
  formatSource: 'DXF' as const,
  nomFichier: 'R+1.dxf',
}

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const [c] = await client<{ id: string }[]>`select id from utilisateur where role = 'CONDUCTEUR'`
  conducteurId = c?.id as string
})

afterAll(fermer)

describe('fond de plan', () => {
  it('remet les zones a l echelle du plan importe, puis les ramene a son retrait', async () => {
    const avant = await contours(1)
    expect(avant.length).toBeGreaterThan(0)
    const r = await enregistrerPlan(db, projetId, { niveau: 1, ...PLAN }, conducteurId)
    expect(r.zonesRemisesAEchelle).toBe(avant.length)
    // 440 x 280 vers 2200 x 1400 : facteur 5 sur les deux axes.
    expect((await contours(1))[0]).toBe(
      avant[0]?.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${x * 5} ${y * 5}`),
    )

    const d = await chargerPlan(db, projetId)
    expect(d.plans).toEqual([
      expect.objectContaining({ niveau: 1, largeur: 2200, hauteur: 1400, nomFichier: 'R+1.dxf' }),
    ])

    await retirerPlan(db, projetId, 1, conducteurId)
    expect(await contours(1)).toEqual(avant)
    const [audit] = await client<{ n: number }[]>`
      select count(*)::int as n from journal_audit where entite = 'plan_niveau'`
    expect(audit?.n).toBe(2)
  })

  it('remplace le plan d un niveau sans en creer un second', async () => {
    await enregistrerPlan(db, projetId, { niveau: 2, ...PLAN }, conducteurId)
    await enregistrerPlan(
      db,
      projetId,
      { niveau: 2, ...PLAN, largeur: 440, hauteur: 280, nomFichier: 'v2.pdf', formatSource: 'PDF' },
      conducteurId,
    )
    const [n] = await client<{ n: number; f: string }[]>`
      select count(*)::int as n, max(nom_fichier) as f from plan_niveau where niveau = 2`
    expect(n).toEqual({ n: 1, f: 'v2.pdf' })
    await retirerPlan(db, projetId, 2, conducteurId)
  })

  it('refuse de retirer un plan absent', async () => {
    expect(await attendreRefus(retirerPlan(db, projetId, 9, conducteurId))).toMatch(/Aucun plan/)
  })
})

describe('zones', () => {
  it('cree une zone, la modifie, puis la supprime, taches comprises', async () => {
    const t1 = await tacheFeuille('04.1.1')
    const t2 = await tacheFeuille('04.1.2')
    const { id } = await enregistrerZone(
      db,
      projetId,
      {
        nom: 'RDC — Local technique',
        niveau: 0,
        points: [
          [10, 150],
          [60, 150],
          [60, 200],
          [10, 200],
        ],
        tacheIds: [t1, t1],
      },
      conducteurId,
    )
    let d = await chargerPlan(db, projetId)
    expect(d.zones.find((z) => z.id === id)).toMatchObject({
      pathSvg: 'M 10 150 L 60 150 L 60 200 L 10 200 Z',
      tacheIds: [t1],
    })

    await enregistrerZone(
      db,
      projetId,
      {
        id,
        nom: 'RDC — Local technique',
        niveau: 0,
        points: [
          [10, 150],
          [80, 150],
          [80, 220],
        ],
        tacheIds: [t2],
      },
      conducteurId,
    )
    d = await chargerPlan(db, projetId)
    expect(d.zones.find((z) => z.id === id)?.tacheIds).toEqual([t2])

    await supprimerZone(db, projetId, id, conducteurId)
    d = await chargerPlan(db, projetId)
    expect(d.zones.some((z) => z.id === id)).toBe(false)
  })

  it('refuse un nom deja pris, un contour hors du plan et une tache de regroupement', async () => {
    const [existante] = await client<{ nom: string }[]>`
      select nom from zone where projet_id = ${projetId} limit 1`
    const base = {
      nom: existante?.nom as string,
      niveau: 0,
      points: [
        [10, 10],
        [100, 10],
        [100, 100],
      ] as [number, number][],
      tacheIds: [],
    }
    expect(await attendreRefus(enregistrerZone(db, projetId, base, conducteurId))).toMatch(
      /s’appelle déjà/,
    )
    expect(
      await attendreRefus(
        enregistrerZone(
          db,
          projetId,
          {
            ...base,
            nom: 'Hors plan',
            points: [
              [0, 0],
              [500, 0],
              [0, 100],
            ],
          },
          conducteurId,
        ),
      ),
    ).toMatch(/déborde/)
    const [noeud] = await client<{ id: string }[]>`
      select t.id from tache t where exists (select 1 from tache e where e.parent_id = t.id) limit 1`
    expect(
      await attendreRefus(
        enregistrerZone(
          db,
          projetId,
          { ...base, nom: 'Regroupement', tacheIds: [noeud?.id as string] },
          conducteurId,
        ),
      ),
    ).toMatch(/élémentaires/)
  })

  it('refuse de supprimer une zone d un autre chantier', async () => {
    expect(
      await attendreRefus(
        supprimerZone(db, projetId, '00000000-0000-4000-8000-000000000000', conducteurId),
      ),
    ).toMatch(/introuvable/)
  })
})
