/**
 * Metre de la maquette de demonstration contre le quantitatif du marche :
 * la maquette est extraite ici, independamment de l'etat de la base.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IfcAPI } from 'web-ifc'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { premierProjetId } from '@/db/queries/contexte'
import { betonParTache } from '@/db/queries/maquette'
import { extraireMaquette } from '@/lib/maquette/ifc'
import { comparerMetre, FAMILLES_BETON, SEUIL_ECART_METRE } from '@/lib/maquette/metre'
import { classer, proposerRegles, tachesParElement } from '@/lib/maquette/regles'

const { db, fermer } = dbScript()
let lignes: ReturnType<typeof comparerMetre>

beforeAll(async () => {
  const api = new IfcAPI()
  await api.Init()
  const m = extraireMaquette(
    api,
    new Uint8Array(readFileSync(resolve(import.meta.dirname, '../seed/residence-palmiers.ifc'))),
  )
  const taches = await betonParTache(db, await premierProjetId(db))
  const elements = classer(m.elements, m.etages)
  const regles = proposerRegles(
    taches.map((t) => ({ id: t.id, nom: t.nom })),
    elements,
  )
  lignes = comparerMetre({
    taches,
    elements: m.elements.map((e) => ({
      globalId: e.globalId,
      volumeM3: e.volumeM3 ?? null,
      source: e.sourceQuantite ?? null,
    })),
    tachesParElement: tachesParElement(elements, regles),
    tachesBeton: new Set(regles.filter((r) => FAMILLES_BETON.has(r.famille)).map((r) => r.tacheId)),
  })
}, 60_000)

afterAll(async () => {
  await fermer()
})

const ligne = (code: string) => lignes.find((l) => l.codeWbs === code)

describe('metre de la maquette contre le DPGF', () => {
  it('chaque element porte un volume tire de sa geometrie', () => {
    expect(ligne('04.2.3')?.source).toBe('GEOMETRIE')
    expect(ligne('04.2.3')?.maquetteM3).toBeCloseTo(36 * 18 * 0.17, 3)
  })

  it('la plupart des ouvrages concordent a cinq pour cent pres', () => {
    const comparees = lignes.filter((l) => l.ecart !== null)
    const hors = comparees.filter((l) => Math.abs(l.ecart as number) > SEUIL_ECART_METRE)
    expect(comparees.length).toBeGreaterThan(10)
    expect(hors.map((l) => l.codeWbs).sort()).toEqual(['04.1.1', '04.4.2'])
  })

  it('signale le dallage modelise sans ligne de beton au quantitatif', () => {
    expect(ligne('03.1.5')).toMatchObject({ quantitatifM3: null, ecart: null })
    expect(ligne('03.1.5')?.maquetteM3).toBeCloseTo(97.2, 3)
    // Une cloison n'est pas en beton : pas de ligne de metre pour elle.
    expect(ligne('06.1.1')).toBeUndefined()
  })
})
