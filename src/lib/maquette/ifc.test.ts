import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IfcAPI } from 'web-ifc'
import { beforeAll, describe, expect, it } from 'vitest'
import { controlerGlb, ecrireGlb } from '@/lib/maquette/glb'
import {
  extraireMaquette,
  glbMaquette,
  niveauxEtages,
  type MaquetteExtraite,
} from '@/lib/maquette/ifc'
import { inventaireGlb } from '@/lib/maquette/inventaire'

const FIXTURE = resolve(import.meta.dirname, '../../db/seed/residence-palmiers.ifc')
let m: MaquetteExtraite

beforeAll(async () => {
  const api = new IfcAPI()
  await api.Init()
  m = extraireMaquette(api, new Uint8Array(readFileSync(FIXTURE)))
}, 30_000)

describe('extraction d une maquette IFC', () => {
  it('lit le schema, les etages et leur niveau depuis le rez-de-chaussee', () => {
    expect(m.schema).toBe('IFC4')
    expect(m.etages.map((e) => [e.nom, e.niveau])).toEqual([
      ['Fondations', -1],
      ['RDC', 0],
      ['R+1', 1],
      ['R+2', 2],
      ['R+3', 3],
      ['Toiture-terrasse', 4],
    ])
  })

  it('inventorie chaque element avec sa classe, son nom accentue et son etage', () => {
    expect(m.elements).toHaveLength(289)
    expect(m.maillages).toHaveLength(289)
    const fenetres = m.elements.filter((e) => e.classe === 'IFCWINDOW')
    expect(fenetres).toHaveLength(64)
    expect(fenetres[0]?.nom).toMatch(/^Fenêtre aluminium/)
    expect(m.elements.find((e) => e.nom === 'Plancher haut du R+1')?.etage).toBe('R+2')
    expect(m.elements.every((e) => e.etage !== null)).toBe(true)
    expect(new Set(m.elements.map((e) => e.globalId)).size).toBe(289)
  })

  it('tourne la geometrie en axe Y vertical, en metres', () => {
    let min = Infinity
    let max = -Infinity
    for (const g of m.maillages) {
      for (let i = 1; i < g.positions.length; i += 3) {
        min = Math.min(min, g.positions[i] as number)
        max = Math.max(max, g.positions[i] as number)
      }
    }
    // Des semelles a -1,20 m a la couverture du local technique, a 14,88 m.
    expect(min).toBeCloseTo(-1.2, 3)
    expect(max).toBeCloseTo(14.88, 3)
  })

  it('produit un GLB identique d une conversion a l autre', () => {
    // Le peuplement et l'import produisent ainsi le meme fichier.
    expect(Buffer.from(glbMaquette(m)).equals(Buffer.from(glbMaquette(m)))).toBe(true)
  })

  it('produit un GLB valide, un noeud par element', () => {
    const glb = glbMaquette(m)
    expect(controlerGlb(glb)).toEqual({ noeuds: 289 })
    // Pas plus de quelques centaines de kilo-octets pour ce batiment.
    expect(glb.byteLength).toBeLessThan(500_000)
  })
})

describe('inventaire relu dans le GLB', () => {
  it('rend les etages et chaque element tels qu extraits', () => {
    const inv = inventaireGlb(glbMaquette(m))
    expect(inv).toEqual({ schema: 'IFC4', etages: m.etages, elements: m.elements })
  })

  it('refuse un inventaire falsifie', () => {
    const faux = {
      ...m,
      maillages: m.maillages.map((g) => ({
        ...g,
        extras: { classe: '<script>', nom: null, etage: null },
      })),
    }
    expect(inventaireGlb(glbMaquette(faux))).toEqual({
      refus: 'Inventaire de la maquette illisible.',
    })
    expect(inventaireGlb(ecrireGlb(m.maillages))).toEqual({
      refus: 'Étages de la maquette illisibles.',
    })
  })
})

describe('niveaux des etages', () => {
  it('prend l etage le plus proche de zero quand aucun ne s appelle rez-de-chaussee', () => {
    expect(
      niveauxEtages([
        { nom: 'Niveau 2', altitude: 6.1 },
        { nom: 'Sous-sol', altitude: -3 },
        { nom: 'Niveau 1', altitude: 3.05 },
        { nom: 'Niveau 0', altitude: 0.05 },
      ]).map((e) => [e.nom, e.niveau]),
    ).toEqual([
      ['Sous-sol', -1],
      ['Niveau 0', 0],
      ['Niveau 1', 1],
      ['Niveau 2', 2],
    ])
  })
})

describe('controle d un GLB', () => {
  it('refuse ce qui n en est pas un, ou un fichier tronque', () => {
    expect(controlerGlb(new TextEncoder().encode('<html>'.padEnd(40)))).toBeNull()
    const glb = ecrireGlb([
      {
        nom: 'a',
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        normales: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        indices: new Uint32Array([0, 1, 2]),
      },
    ])
    expect(controlerGlb(glb)).toEqual({ noeuds: 1 })
    expect(controlerGlb(glb.subarray(0, glb.byteLength - 4))).toBeNull()
  })
})
