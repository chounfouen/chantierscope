import { describe, expect, it } from 'vitest'
import {
  comparerWbs,
  debutsDePeriode,
  defilementPourCentrer,
  enAttributPoints,
  fenetre,
  jourAuCentre,
  jourDeX,
  journeesGrisees,
  lignesVisibles,
  PALIERS,
  PIXELS_PAR_JOUR,
  repartirCouloirs,
  SEUIL_VIRTUALISATION,
  simplifier,
  tracerLiaison,
  xDeJour,
} from '@/db/compute/gantt'

describe('echelle de temps', () => {
  it('convertit jours et abscisses dans les deux sens, a chaque palier', () => {
    for (const p of PALIERS) {
      expect(jourDeX(xDeJour(137, p), p)).toBeCloseTo(137, 10)
    }
    expect(xDeJour(10, 'jour')).toBe(320)
  })

  it('les paliers vont du plus fin au plus large', () => {
    const largeurs = PALIERS.map((p) => PIXELS_PAR_JOUR[p])
    expect([...largeurs].sort((a, b) => b - a)).toEqual(largeurs)
  })
})

describe('conservation du centrage au changement de palier', () => {
  const vue = 1000

  it('la journee au centre reste au centre apres changement de palier', () => {
    // Au palier mois, le centre de la vue tombe sur le jour 200.
    const defilementMois = xDeJour(200, 'mois') - vue / 2
    const centre = jourAuCentre(defilementMois, vue, 'mois')
    expect(centre).toBeCloseTo(200, 10)

    // Passage au palier jour : on recentre sur ce meme jour.
    const largeurTotale = xDeJour(412, 'jour')
    const defilementJour = defilementPourCentrer(centre, 'jour', vue, largeurTotale)
    expect(jourAuCentre(defilementJour, vue, 'jour')).toBeCloseTo(200, 10)
  })

  it('borne le defilement au debut et a la fin du planning', () => {
    expect(defilementPourCentrer(2, 'jour', vue, xDeJour(412, 'jour'))).toBe(0)
    const total = xDeJour(412, 'jour')
    expect(defilementPourCentrer(411, 'jour', vue, total)).toBe(total - vue)
  })

  it('un planning plus etroit que la vue ne defile pas', () => {
    expect(defilementPourCentrer(100, 'trimestre', vue, xDeJour(412, 'trimestre'))).toBe(0)
  })
})

describe('graduations', () => {
  // Le 2 mars 2026 est un lundi.
  const origine = '2026-03-02'

  it('les semaines commencent le lundi', () => {
    const s = debutsDePeriode(origine, 15, 'semaine')
    expect(s.map((g) => g.jour)).toEqual([0, 7, 14])
  })

  it('les mois commencent le premier', () => {
    const m = debutsDePeriode(origine, 70, 'mois')
    // 1er avril : jour 30 ; 1er mai : jour 60.
    expect(m.map((g) => g.jour)).toEqual([30, 60])
  })

  it('les trimestres commencent en janvier, avril, juillet et octobre', () => {
    const t = debutsDePeriode(origine, 412, 'trimestre')
    expect(t.map((g) => g.date.toISOString().slice(0, 10))).toEqual([
      '2026-04-01',
      '2026-07-01',
      '2026-10-01',
      '2027-01-01',
      '2027-04-01',
    ])
  })

  it('les annees commencent le premier janvier', () => {
    expect(debutsDePeriode(origine, 412, 'annee').map((g) => g.jour)).toEqual([305])
  })
})

describe('WBS repliable', () => {
  const wbs = [
    { id: 'lot', parentId: null, codeWbs: '04' },
    { id: 'n1', parentId: 'lot', codeWbs: '04.1' },
    { id: 'n10', parentId: 'lot', codeWbs: '04.10' },
    { id: 'n2', parentId: 'lot', codeWbs: '04.2' },
    { id: 't11', parentId: 'n1', codeWbs: '04.1.1' },
    { id: 't12', parentId: 'n1', codeWbs: '04.1.2' },
    { id: 't21', parentId: 'n2', codeWbs: '04.2.1' },
  ]

  it('ordonne numeriquement par segment : 04.10 apres 04.2', () => {
    expect(lignesVisibles(wbs, new Set()).map((l) => l.id)).toEqual([
      'lot',
      'n1',
      't11',
      't12',
      'n2',
      't21',
      'n10',
    ])
  })

  it('porte la profondeur et la presence d enfants', () => {
    const l = lignesVisibles(wbs, new Set())
    expect(l.find((x) => x.id === 't11')).toEqual({ id: 't11', profondeur: 2, aEnfants: false })
    expect(l.find((x) => x.id === 'n10')).toEqual({ id: 'n10', profondeur: 1, aEnfants: false })
  })

  it('un noeud replie masque ses descendants mais reste affiche', () => {
    expect(lignesVisibles(wbs, new Set(['n1'])).map((l) => l.id)).toEqual([
      'lot',
      'n1',
      'n2',
      't21',
      'n10',
    ])
  })

  it('replier une racine masque tout le sous-arbre', () => {
    expect(lignesVisibles(wbs, new Set(['lot'])).map((l) => l.id)).toEqual(['lot'])
  })

  it('compare des codes de longueurs differentes', () => {
    expect(comparerWbs('04', '04.1')).toBeLessThan(0)
    expect(comparerWbs('04.1.2', '04.1')).toBeGreaterThan(0)
    expect(comparerWbs('04.2', '04.2')).toBe(0)
  })
})

describe('virtualisation verticale', () => {
  it('rend toutes les lignes jusqu au seuil', () => {
    expect(fenetre(5000, 600, 28, SEUIL_VIRTUALISATION)).toEqual({ debut: 0, fin: 100 })
  })

  it('au-dela du seuil, ne rend que la vue et sa marge', () => {
    // Defilement de 2800 pixels : premiere ligne visible 100, 22 lignes visibles.
    expect(fenetre(2800, 600, 28, 1000, 8)).toEqual({ debut: 92, fin: 130 })
  })

  it('borne la fenetre aux extremites', () => {
    expect(fenetre(0, 600, 28, 200, 8)).toEqual({ debut: 0, fin: 30 })
    expect(fenetre(28 * 195, 600, 28, 200, 8)).toEqual({ debut: 187, fin: 200 })
  })
})

describe('trace des liaisons', () => {
  const h = 28

  it('fin-debut avec espace : trois segments, couloir juste apres la fin amont', () => {
    const p = tracerLiaison({ x0: 0, x1: 100, y: 14 }, { x0: 160, x1: 200, y: 42 }, 'FD', h)
    expect(p).toEqual([
      { x: 100, y: 14 },
      { x: 108, y: 14 },
      { x: 108, y: 42 },
      { x: 160, y: 42 },
    ])
  })

  it('fin-debut sans espace : contournement par l interligne sous la barre amont', () => {
    // Le successeur commence avant la fin du predecesseur (recouvrement).
    const p = tracerLiaison({ x0: 0, x1: 100, y: 14 }, { x0: 90, x1: 200, y: 70 }, 'FD', h)
    expect(p).toEqual([
      { x: 100, y: 14 },
      { x: 108, y: 14 },
      { x: 108, y: 28 },
      { x: 82, y: 28 },
      { x: 82, y: 70 },
      { x: 90, y: 70 },
    ])
  })

  it('contourne par l interligne au-dessus quand le successeur est plus haut', () => {
    const p = tracerLiaison({ x0: 0, x1: 100, y: 70 }, { x0: 50, x1: 200, y: 14 }, 'FD', h)
    expect(p[2]).toEqual({ x: 108, y: 56 })
  })

  it('debut-debut : sortie et entree par la gauche', () => {
    const p = tracerLiaison({ x0: 50, x1: 100, y: 14 }, { x0: 80, x1: 200, y: 42 }, 'DD', h)
    expect(p).toEqual([
      { x: 50, y: 14 },
      { x: 42, y: 14 },
      { x: 42, y: 42 },
      { x: 80, y: 42 },
    ])
  })

  it('fin-fin : sortie et entree par la droite, couloir le plus a droite', () => {
    const p = tracerLiaison({ x0: 0, x1: 100, y: 14 }, { x0: 20, x1: 140, y: 42 }, 'FF', h)
    expect(p).toEqual([
      { x: 100, y: 14 },
      { x: 148, y: 14 },
      { x: 148, y: 42 },
      { x: 140, y: 42 },
    ])
  })

  it('debut-fin : de la gauche amont vers la droite aval', () => {
    const p = tracerLiaison({ x0: 200, x1: 300, y: 14 }, { x0: 20, x1: 100, y: 42 }, 'DF', h)
    expect(p).toEqual([
      { x: 200, y: 14 },
      { x: 192, y: 14 },
      { x: 192, y: 42 },
      { x: 100, y: 42 },
    ])
  })

  it('tous les segments sont horizontaux ou verticaux', () => {
    for (const type of ['FD', 'DD', 'FF', 'DF'] as const) {
      for (const aval of [
        { x0: 160, x1: 200, y: 98 },
        { x0: 10, x1: 40, y: 98 },
      ]) {
        const p = tracerLiaison({ x0: 50, x1: 100, y: 14 }, aval, type, h)
        for (let i = 1; i < p.length; i++) {
          const a = p[i - 1]
          const b = p[i]
          expect(a?.x === b?.x || a?.y === b?.y, `${type} segment ${i}`).toBe(true)
        }
      }
    }
  })

  it('simplifie les points alignes et les doublons', () => {
    expect(
      simplifier([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 5 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
    ])
  })

  it('produit l attribut points d une polyligne', () => {
    expect(
      enAttributPoints([
        { x: 1.25, y: 2 },
        { x: 3, y: 4.04 },
      ]),
    ).toBe('1.3,2 3,4')
  })
})

describe('evitement des chevauchements', () => {
  const vertical = (x: number, y0: number, y1: number) => [
    { x: x - 10, y: y0 },
    { x, y: y0 },
    { x, y: y1 },
    { x: x + 20, y: y1 },
  ]

  it('decale le couloir d une liaison d une autre source qui se superpose', () => {
    const [a, b] = repartirCouloirs([
      { source: 'A', points: vertical(100, 10, 80) },
      { source: 'B', points: vertical(100, 40, 120) },
    ])
    expect(a?.[1]?.x).toBe(100)
    expect(b?.[1]?.x).toBe(103)
    expect(b?.[2]?.x).toBe(103)
    // Les extremites ne bougent pas : la liaison part et arrive au meme endroit.
    expect(b?.[0]).toEqual({ x: 90, y: 40 })
    expect(b?.[3]).toEqual({ x: 120, y: 120 })
  })

  it('les liaisons d une meme source partagent leur couloir', () => {
    const [, b] = repartirCouloirs([
      { source: 'A', points: vertical(100, 10, 80) },
      { source: 'A', points: vertical(100, 10, 120) },
    ])
    expect(b?.[1]?.x).toBe(100)
  })

  it('deux couloirs a la meme abscisse sans recouvrement vertical ne bougent pas', () => {
    const [, b] = repartirCouloirs([
      { source: 'A', points: vertical(100, 10, 40) },
      { source: 'B', points: vertical(100, 60, 90) },
    ])
    expect(b?.[1]?.x).toBe(100)
  })

  it('empile trois liaisons en trois couloirs distincts', () => {
    const r = repartirCouloirs([
      { source: 'A', points: vertical(100, 0, 100) },
      { source: 'B', points: vertical(100, 0, 100) },
      { source: 'C', points: vertical(100, 0, 100) },
    ])
    expect(r.map((p) => p[1]?.x)).toEqual([100, 103, 106])
  })
})

describe('journees grisees', () => {
  const origine = '2026-03-02'
  const dimancheRepos = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 0

  it('grise les dimanches avec leur cause', () => {
    const g = journeesGrisees(origine, 14, dimancheRepos, () => 'Repos hebdomadaire', [])
    expect(g).toEqual([
      { jour: 6, cause: 'Repos hebdomadaire' },
      { jour: 13, cause: 'Repos hebdomadaire' },
    ])
  })

  it('ajoute les arrets constates et reunit les causes d un meme jour', () => {
    const g = journeesGrisees(origine, 14, dimancheRepos, () => 'Repos hebdomadaire', [
      { date: '2026-03-04', cause: 'Pluie forte (lot 02)' },
      { date: '2026-03-08', cause: 'Pluie forte (lot 02)' },
      { date: '2026-03-04', cause: 'Pluie forte (lot 02)' },
      { date: '2026-05-01', cause: 'hors periode' },
    ])
    expect(g).toEqual([
      { jour: 2, cause: 'Pluie forte (lot 02)' },
      { jour: 6, cause: 'Repos hebdomadaire ; Pluie forte (lot 02)' },
      { jour: 13, cause: 'Repos hebdomadaire' },
    ])
  })
})
