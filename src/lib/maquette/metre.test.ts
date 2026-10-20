import { describe, expect, it } from 'vitest'
import { comparerMetre, volumeMaillage, volumeQto } from '@/lib/maquette/metre'

/** Pave de 2 x 3 x 4, triangule, faces orientees vers l'exterieur. */
function pave(lx: number, ly: number, lz: number) {
  const p = [
    [0, 0, 0],
    [lx, 0, 0],
    [lx, ly, 0],
    [0, ly, 0],
    [0, 0, lz],
    [lx, 0, lz],
    [lx, ly, lz],
    [0, ly, lz],
  ].flat()
  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ]
  const i = faces.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]) as number[]
  return { positions: new Float32Array(p), indices: new Uint32Array(i) }
}

describe('volume d un maillage', () => {
  it('retrouve le volume d un pave ferme, quelle que soit sa position', () => {
    const { positions, indices } = pave(2, 3, 4)
    expect(volumeMaillage(positions, indices)).toBeCloseTo(24, 6)
    const decale = positions.map((v, k) => v + (k % 3 === 2 ? 100 : 7))
    expect(volumeMaillage(decale, indices)).toBeCloseTo(24, 3)
  })
})

describe('quantites IFC', () => {
  it('prefere le volume net au volume brut', () => {
    expect(
      volumeQto([
        { nom: 'GrossVolume', volume: 2.5 },
        { nom: 'NetVolume', volume: 2.1 },
      ]),
    ).toBe(2.1)
    expect(volumeQto([])).toBeNull()
  })
})

describe('metre contre quantitatif', () => {
  it('somme les elements de chaque tache et mesure l ecart au beton prevu', () => {
    const lignes = comparerMetre({
      taches: [
        { id: 't1', codeWbs: '03.1.2', nom: 'Semelles', betonM3: 10 },
        { id: 't2', codeWbs: '03.1.5', nom: 'Dallage', betonM3: null },
        { id: 't3', codeWbs: '06.1.1', nom: 'Cloisons', betonM3: null },
      ],
      elements: [
        { globalId: 'a', volumeM3: 4.5, source: 'GEOMETRIE' },
        { globalId: 'b', volumeM3: 6.0, source: 'QTO' },
        { globalId: 'c', volumeM3: 97.2, source: 'GEOMETRIE' },
        { globalId: 'd', volumeM3: 12, source: 'GEOMETRIE' },
      ],
      tachesParElement: new Map([
        ['a', ['t1']],
        ['b', ['t1']],
        ['c', ['t2']],
        ['d', ['t3']],
      ]),
      // Les cloisons ne sont pas en beton : leur absence du quantitatif beton
      // n'est pas un oubli.
      tachesBeton: new Set(['t1', 't2']),
    })
    expect(lignes).toHaveLength(2)
    expect(lignes[0]).toMatchObject({ maquetteM3: 10.5, elements: 2, source: 'MIXTE' })
    expect(lignes[0]?.ecart).toBeCloseTo(0.05, 12)
    // Une tache modelisee sans ligne de beton au quantitatif : un oubli du DPGF.
    expect(lignes[1]).toMatchObject({ maquetteM3: 97.2, quantitatifM3: null, ecart: null })
  })
})
