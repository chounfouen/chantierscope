import { describe, expect, it } from 'vitest'
import {
  cadrer,
  dessinVersSvg,
  ErreurImport,
  lireDxf,
  matriceInsertion,
  pointsArc,
  pointsRenflement,
  texteBrut,
  type Point,
} from '@/lib/plan/dxf'

/** Fichier DXF minimal : chaque paire (code, valeur) sur deux lignes. */
function dxf(sections: { calques?: string; blocs?: string; entites: string }): string {
  return [
    '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n',
    sections.calques ?? '',
    '0\nENDTAB\n0\nENDSEC\n',
    '0\nSECTION\n2\nBLOCKS\n',
    sections.blocs ?? '',
    '0\nENDSEC\n',
    '0\nSECTION\n2\nENTITIES\n',
    sections.entites,
    '0\nENDSEC\n0\nEOF\n',
  ].join('')
}

const ligne = (calque: string, x1: number, y1: number, x2: number, y2: number) =>
  `0\nLINE\n8\n${calque}\n10\n${x1}\n20\n${y1}\n11\n${x2}\n21\n${y2}\n`

const proche = (a: Point, b: Point) => {
  expect(a[0]).toBeCloseTo(b[0], 6)
  expect(a[1]).toBeCloseTo(b[1], 6)
}

describe('geometrie', () => {
  it('decoupe un demi-cercle en segments sur le cercle', () => {
    const p = pointsArc([0, 0], 2, 0, Math.PI)
    proche(p[0] as Point, [2, 0])
    proche(p[p.length - 1] as Point, [-2, 0])
    for (const [x, y] of p) expect(Math.hypot(x, y)).toBeCloseTo(2, 9)
  })

  it('tourne un renflement de 1 en demi-cercle, du bon cote', () => {
    // Renflement positif : arc dans le sens trigonometrique, par le bas.
    const p = pointsRenflement([0, 0], [2, 0], 1)
    proche(p[p.length - 1] as Point, [2, 0])
    const milieu = p[Math.floor(p.length / 2) - 1] as Point
    expect(milieu[1]).toBeLessThan(0)
    for (const [x, y] of p) expect(Math.hypot(x - 1, y)).toBeCloseTo(1, 9)
  })

  it('compose une insertion : point de base, echelle, rotation, position', () => {
    const m = matriceInsertion([10, 5], 90, 2, 2, [1, 0])
    // (2, 0) - base = (1, 0) ; x2 = (2, 0) ; rotation 90 = (0, 2) ; + (10, 5).
    const [a, b, c, d, e, f] = m
    proche([a * 2 + c * 0 + e, b * 2 + d * 0 + f], [10, 7])
  })
})

describe('lecture d un DXF', () => {
  it('lit traits, cercle, polyligne fermee et texte, calque par calque', () => {
    const d = lireDxf(
      dxf({
        entites:
          ligne('MURS', 0, 0, 10, 0) +
          '0\nCIRCLE\n8\nPOTEAUX\n10\n5\n20\n5\n40\n1\n' +
          '0\nLWPOLYLINE\n8\nMURS\n90\n4\n70\n1\n10\n0\n20\n0\n10\n10\n20\n0\n10\n10\n20\n8\n10\n0\n20\n8\n' +
          '0\nTEXT\n8\nTEXTES\n10\n2\n20\n2\n40\n0.5\n1\nSéjour\n',
      }),
    )
    expect(d.polylignes).toHaveLength(3)
    expect(d.polylignes[2]?.fermee).toBe(true)
    expect(d.textes[0]).toMatchObject({ contenu: 'Séjour', x: 2, y: 2, hauteur: 0.5 })
    expect(d.calques.map((c) => [c.nom, c.entites])).toEqual([
      ['MURS', 2],
      ['POTEAUX', 1],
      ['TEXTES', 1],
    ])
  })

  it('developpe un bloc insere, et le calque 0 du bloc prend celui de l insertion', () => {
    const d = lireDxf(
      dxf({
        blocs:
          '0\nBLOCK\n8\n0\n2\nPORTE\n70\n0\n10\n0\n20\n0\n3\nPORTE\n' +
          ligne('0', 0, 0, 1, 0) +
          '0\nENDBLK\n',
        entites: '0\nINSERT\n8\nMENUISERIES\n2\nPORTE\n10\n100\n20\n50\n41\n3\n42\n3\n50\n90\n',
      }),
    )
    expect(d.polylignes).toHaveLength(1)
    const [a, b] = d.polylignes[0]?.points ?? []
    proche(a as Point, [100, 50])
    proche(b as Point, [100, 53])
    expect(d.polylignes[0]?.calque).toBe('MENUISERIES')
  })

  it('masque par defaut les calques geles', () => {
    const d = lireDxf(
      dxf({
        calques: '0\nLAYER\n2\nMOBILIER\n70\n1\n62\n7\n6\nCONTINUOUS\n',
        entites: ligne('MOBILIER', 0, 0, 1, 1) + ligne('MURS', 0, 0, 2, 2),
      }),
    )
    expect(Object.fromEntries(d.calques.map((c) => [c.nom, c.visibleParDefaut]))).toEqual({
      MOBILIER: false,
      MURS: true,
    })
  })

  it('refuse un DWG en disant comment l exporter', () => {
    expect(() => lireDxf('AC1032\u0000\u0000binaire')).toThrow(/enregistrer au format DXF/)
  })

  it('refuse un fichier sans trait dessinable', () => {
    expect(() => lireDxf(dxf({ entites: '' }))).toThrow(ErreurImport)
  })

  it('compte ce qu il ne sait pas dessiner', () => {
    const d = lireDxf(dxf({ entites: ligne('A', 0, 0, 1, 0) + '0\nHATCH\n8\nA\n' }))
    expect(d.ignorees).toEqual({ HATCH: 1 })
  })
})

describe('cadrage et rendu', () => {
  it('ignore un trait egare a des kilometres', () => {
    const traits = Array.from({ length: 200 }, (_, i) => ({
      calque: 'A',
      fermee: false,
      points: [
        [i % 20, 0],
        [i % 20, 10],
      ] as Point[],
    }))
    traits.push({
      calque: 'A',
      fermee: false,
      points: [
        [1e6, 1e6],
        [1e6 + 1, 1e6],
      ],
    })
    const b = cadrer(traits)
    expect(b.maxX).toBeLessThan(30)
    expect(b.maxY).toBeLessThan(30)
  })

  it('produit un SVG en pixels, Y retourne, textes echappes', () => {
    const d = lireDxf(
      dxf({
        entites:
          ligne('MURS', 0, 0, 100, 0) +
          ligne('MURS', 0, 0, 0, 50) +
          '0\nTEXT\n8\nMURS\n10\n10\n20\n10\n40\n5\n1\nA<B & C\n',
      }),
    )
    const r = dessinVersSvg(d, new Set(['MURS']), 1048)
    expect(r.largeur).toBe(1048)
    expect(r.hauteur).toBe(548)
    // Le point (0, 0) du DXF est en bas a gauche, apres la marge.
    expect(r.svg).toContain('M24 524L1024 524')
    expect(r.svg).toContain('A&lt;B &amp; C')
    expect(r.svg).not.toContain('<script')
  })

  it('n affiche que les calques retenus', () => {
    const d = lireDxf(dxf({ entites: ligne('A', 0, 0, 1, 0) + ligne('B', 0, 0, 0, 1) }))
    expect(() => dessinVersSvg(d, new Set())).toThrow(/Aucun calque visible/)
    expect(dessinVersSvg(d, new Set(['A'])).svg.match(/M/g)).toHaveLength(1)
  })

  it('retire la mise en forme d un texte multiligne', () => {
    expect(texteBrut('{\\fArial|b1;Cuisine}\\PØ 20 %%c')).toBe('Cuisine Ø 20 Ø')
  })
})
