/**
 * Tests d'integration de la maquette, sur la base dediee.
 *
 * La base de test peut porter la maquette de demonstration : chaque cas la
 * reprend a son compte puis remet le projet sans maquette ni regle qui ne
 * soit du jeu de demonstration.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IfcAPI } from 'web-ifc'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import {
  ajouterRegles,
  enregistrerMaquette,
  retirerMaquette,
  supprimerRegle,
} from '@/db/mutations/maquette'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerMaquette } from '@/db/queries/maquette'
import { extraireMaquette, type MaquetteExtraite } from '@/lib/maquette/ifc'

const { db, client, fermer } = dbScript()

type LigneMaquette = {
  id: string
  projet_id: string
  chemin: string
  octets: number
  nom_fichier: string
  schema_ifc: string
  etages: unknown
  importe_le: Date
  importe_par: string | null
}
let projetId: string
let conducteurId: string
let m: MaquetteExtraite
let sauvegarde: { maquette: unknown[]; elements: unknown[]; regles: unknown[] }

async function attendreRefus(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(RefusMetier)
    return (e as Error).message
  }
  throw new Error('Refus attendu')
}

async function tache(code: string): Promise<string> {
  const [t] = await client<{ id: string }[]>`select id from tache where code_wbs = ${code}`
  return t?.id as string
}

const enregistrer = () =>
  enregistrerMaquette(
    db,
    projetId,
    {
      chemin: 'projets/x/maquettes/essai.glb',
      octets: 1000,
      nomFichier: 'residence.ifc',
      schemaIfc: m.schema,
      etages: m.etages,
      elements: m.elements,
    },
    conducteurId,
  )

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const [c] = await client<{ id: string }[]>`select id from utilisateur where role = 'CONDUCTEUR'`
  conducteurId = c?.id as string
  const api = new IfcAPI()
  await api.Init()
  m = extraireMaquette(
    api,
    new Uint8Array(readFileSync(resolve(import.meta.dirname, '../seed/residence-palmiers.ifc'))),
  )
  // Etat du jeu de demonstration, restaure a la fin.
  sauvegarde = {
    maquette: [...(await client`select * from maquette`)],
    elements: [...(await client`select * from element_maquette`)],
    regles: [...(await client`select * from regle_maquette`)],
  }
  await client`delete from regle_maquette`
  await client`delete from maquette`
}, 30_000)

afterAll(async () => {
  await client`delete from regle_maquette`
  await client`delete from maquette`
  for (const r of sauvegarde.maquette as LigneMaquette[]) {
    await client`
      insert into maquette (id, projet_id, chemin, octets, nom_fichier, schema_ifc, etages,
                            importe_le, importe_par)
      values (${r.id}, ${r.projet_id}, ${r.chemin},
              ${r.octets}, ${r.nom_fichier}, ${r.schema_ifc},
              ${JSON.stringify(r.etages)}::jsonb, ${r.importe_le},
              ${r.importe_par})`
  }
  for (const r of sauvegarde.elements)
    await client`insert into element_maquette ${client(r as never)}`
  for (const r of sauvegarde.regles) await client`insert into regle_maquette ${client(r as never)}`
  await fermer()
})

describe('maquette', () => {
  it('s importe avec son inventaire, et se remplace sans doublon', async () => {
    await enregistrer()
    await enregistrer()
    const d = await chargerMaquette(db, projetId)
    expect(d.maquette).toMatchObject({ nomFichier: 'residence.ifc', schemaIfc: 'IFC4' })
    expect(d.maquette?.etages.map((e) => e.niveau)).toEqual([-1, 0, 1, 2, 3, 4])
    expect(d.elements).toHaveLength(289)
    const [n] = await client<{ n: number }[]>`select count(*)::int as n from maquette`
    expect(n?.n).toBe(1)
  })

  it('garde ses regles au remplacement, et les suit dans le suivi des taches', async () => {
    await enregistrer()
    const voiles = await tache('04.3.2')
    const ajoutees = await ajouterRegles(
      db,
      projetId,
      [
        { tacheId: voiles, famille: 'MURS', niveau: 2, nomContient: 'voile' },
        // Doublon : ignore.
        { tacheId: voiles, famille: 'MURS', niveau: 2, nomContient: 'voile' },
      ],
      conducteurId,
    )
    expect(ajoutees).toBe(1)
    await enregistrer()
    const d = await chargerMaquette(db, projetId)
    expect(d.regles).toEqual([
      expect.objectContaining({
        codeWbs: '04.3.2',
        famille: 'MURS',
        niveau: 2,
        nomContient: 'voile',
      }),
    ])
    expect(d.taches.map((t) => t.codeWbs)).toEqual(['04.3.2'])
    expect(d.taches[0]?.lignes.length).toBeGreaterThan(0)

    await supprimerRegle(db, projetId, d.regles[0]?.id as string, conducteurId)
    expect((await chargerMaquette(db, projetId)).regles).toHaveLength(0)
    const [audit] = await client<{ n: number }[]>`
      select count(*)::int as n from journal_audit where entite = 'regle_maquette'`
    expect(audit?.n).toBeGreaterThanOrEqual(2)
  })

  it('refuse une tache de regroupement, et un retrait sans maquette', async () => {
    const [noeud] = await client<{ id: string }[]>`
      select t.id from tache t where exists (select 1 from tache e where e.parent_id = t.id) limit 1`
    expect(
      await attendreRefus(
        ajouterRegles(
          db,
          projetId,
          [{ tacheId: noeud?.id as string, famille: 'DALLES', niveau: null, nomContient: null }],
          conducteurId,
        ),
      ),
    ).toMatch(/élémentaires/)
    await retirerMaquette(db, projetId, conducteurId)
    expect((await chargerMaquette(db, projetId)).maquette).toBeNull()
    expect(await attendreRefus(retirerMaquette(db, projetId, conducteurId))).toMatch(/Aucune/)
  })
})
