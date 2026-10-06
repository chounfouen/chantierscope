/**
 * Lecture d'un plan AutoCAD au format DXF et conversion en dessin SVG.
 *
 * Le DXF est le format d'echange ouvert d'AutoCAD : tous les logiciels de
 * DAO l'exportent (AutoCAD, BricsCAD, ArchiCAD, Revit, LibreCAD). Le DWG,
 * format natif, est ferme ; on demande de l'enregistrer en DXF plutot que
 * d'embarquer un decodeur sous licence GPL.
 *
 * Toute la geometrie est aplatie en polylignes dans le repere du dessin :
 * arcs et cercles sont decoupes en segments, les blocs (INSERT) sont
 * developpes avec leur transformation, les cotations reprennent leur bloc
 * anonyme. Le resultat sert de FOND de plan, sur lequel on dessine les
 * zones : la fidelite visuelle compte, pas la semantique CAO.
 *
 * Logique pure, sans navigateur : elle se teste unitairement.
 */

import DxfParser from 'dxf-parser'
import { FOND_DE_PLAN } from '@/lib/viz'

export type Point = [number, number]

export type Polyligne = { calque: string; points: Point[]; fermee: boolean }

export type Texte = {
  calque: string
  x: number
  y: number
  hauteur: number
  /** Degres, sens trigonometrique, comme dans le DXF. */
  rotation: number
  contenu: string
}

export type Calque = { nom: string; entites: number; visibleParDefaut: boolean }

export type DessinDxf = {
  polylignes: Polyligne[]
  textes: Texte[]
  calques: Calque[]
  /** Types d'entites non dessines, avec leur nombre : dit honnetement ce qui manque. */
  ignorees: Record<string, number>
}

export class ErreurImport extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurImport'
  }
}

/* -------------------------------------------------------------------------- */
/* Transformations                                                            */
/* -------------------------------------------------------------------------- */

/** Matrice affine 2D [a, b, c, d, e, f] : x' = a x + c y + e ; y' = b x + d y + f. */
type Matrice = [number, number, number, number, number, number]

const IDENTITE: Matrice = [1, 0, 0, 1, 0, 0]

function composer(m: Matrice, n: Matrice): Matrice {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

function appliquer(m: Matrice, [x, y]: Point): Point {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

/** Echelle moyenne d'une matrice : pour la hauteur des textes. */
function echelle(m: Matrice): number {
  return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]))
}

/** Rotation portee par une matrice, en degres. */
function rotationDe(m: Matrice): number {
  return (Math.atan2(m[1], m[0]) * 180) / Math.PI
}

/** Transformation d'une insertion de bloc : translation, rotation, echelle, point de base. */
export function matriceInsertion(
  position: Point,
  rotationDeg: number,
  ex: number,
  ey: number,
  base: Point,
): Matrice {
  const r = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const deplacement: Matrice = [1, 0, 0, 1, position[0], position[1]]
  const rotation: Matrice = [cos, sin, -sin, cos, 0, 0]
  const mise: Matrice = [ex, 0, 0, ey, 0, 0]
  const retourBase: Matrice = [1, 0, 0, 1, -base[0], -base[1]]
  return composer(deplacement, composer(rotation, composer(mise, retourBase)))
}

/* -------------------------------------------------------------------------- */
/* Courbes                                                                    */
/* -------------------------------------------------------------------------- */

/** Nombre de segments pour un arc : fin pour les grands, sobre pour les petits. */
function segmentsArc(balayage: number): number {
  return Math.max(4, Math.min(96, Math.ceil((Math.abs(balayage) / (2 * Math.PI)) * 72)))
}

/** Points d'un arc de cercle, angles en radians, sens trigonometrique. */
export function pointsArc(centre: Point, rayon: number, debut: number, fin: number): Point[] {
  let balayage = fin - debut
  while (balayage <= 0) balayage += 2 * Math.PI
  const n = segmentsArc(balayage)
  const points: Point[] = []
  for (let i = 0; i <= n; i++) {
    const a = debut + (balayage * i) / n
    points.push([centre[0] + rayon * Math.cos(a), centre[1] + rayon * Math.sin(a)])
  }
  return points
}

/**
 * Segment de polyligne avec renflement (bulge) : un arc entre deux sommets.
 * Le renflement est la tangente du quart de l'angle balaye, signe compris.
 */
export function pointsRenflement(a: Point, b: Point, renflement: number): Point[] {
  if (Math.abs(renflement) < 1e-9) return [b]
  const theta = 4 * Math.atan(renflement)
  const corde = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (corde < 1e-12) return [b]
  const rayon = corde / (2 * Math.sin(theta / 2))
  const milieu: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  // Distance signee du milieu de la corde au centre.
  const h = rayon * Math.cos(theta / 2)
  const nx = -(b[1] - a[1]) / corde
  const ny = (b[0] - a[0]) / corde
  const centre: Point = [milieu[0] + nx * h, milieu[1] + ny * h]
  const debut = Math.atan2(a[1] - centre[1], a[0] - centre[0])
  const n = segmentsArc(theta)
  const points: Point[] = []
  for (let i = 1; i <= n; i++) {
    const t = debut + (theta * i) / n
    points.push([
      centre[0] + Math.abs(rayon) * Math.cos(t),
      centre[1] + Math.abs(rayon) * Math.sin(t),
    ])
  }
  // Le dernier point est exactement le sommet suivant, sans derive numerique.
  points[points.length - 1] = b
  return points
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                    */
/* -------------------------------------------------------------------------- */

type PointBrut = { x: number; y: number }

/** Champs lus sur une entite du lecteur, tous facultatifs selon son type. */
type Brut = {
  type: string
  layer?: string
  inPaperSpace?: boolean
  vertices?: (PointBrut & { bulge?: number })[]
  shape?: boolean
  closed?: boolean
  radius?: number
  center?: PointBrut
  startAngle?: number
  endAngle?: number
  majorAxisEndPoint?: PointBrut
  axisRatio?: number
  fitPoints?: PointBrut[]
  controlPoints?: PointBrut[]
  points?: PointBrut[]
  text?: string
  startPoint?: PointBrut
  position?: PointBrut
  textHeight?: number
  height?: number
  rotation?: number
  name?: string
  block?: string
  columnCount?: number
  rowCount?: number
  columnSpacing?: number
  rowSpacing?: number
  xScale?: number
  yScale?: number
}

const pt = (p: PointBrut | undefined): Point => [p?.x ?? 0, p?.y ?? 0]
const nombre = (v: unknown, defaut: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : defaut

/** Profondeur maximale d'imbrication des blocs : garde-fou contre un cycle. */
const PROFONDEUR_MAX = 8

/** Au-dela, le fichier est refuse : un fond de plan n'en a jamais besoin. */
export const SEGMENTS_MAX = 400_000

/** Codes de mise en forme d'un MTEXT, retires pour n'afficher que le texte. */
export function texteBrut(mtext: string): string {
  return mtext
    .replace(/\\P/g, ' ')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/\\[LlOoKk]/g, '')
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/\s+/g, ' ')
    .trim()
}

export function lireDxf(source: string): DessinDxf {
  if (/^AC10\d\d/.test(source.slice(0, 6))) {
    throw new ErreurImport(
      'Ce fichier est un DWG. Dans AutoCAD, l’enregistrer au format DXF (Fichier, Enregistrer sous, DXF) ou l’exporter en PDF.',
    )
  }
  let dxf: ReturnType<DxfParser['parseSync']>
  try {
    dxf = new DxfParser().parseSync(source)
  } catch {
    dxf = null
  }
  if (!dxf)
    throw new ErreurImport(
      'Fichier DXF illisible : vérifier qu’il s’agit bien d’un export DXF texte.',
    )

  const tableCalques = dxf.tables?.layer?.layers ?? {}
  const blocs = dxf.blocks ?? {}
  const polylignes: Polyligne[] = []
  const textes: Texte[] = []
  const ignorees: Record<string, number> = {}
  const parCalque = new Map<string, number>()
  let segments = 0

  const ajouter = (calque: string, points: Point[], fermee = false) => {
    if (points.length < 2) return
    segments += points.length
    if (segments > SEGMENTS_MAX) {
      throw new ErreurImport(
        'Plan trop détaillé pour servir de fond. Masquer les calques de hachures et de mobilier avant l’export, ou exporter en PDF.',
      )
    }
    polylignes.push({ calque, points, fermee })
  }

  const parcourir = (
    entites: Brut[],
    m: Matrice,
    calqueParent: string | null,
    profondeur: number,
  ) => {
    for (const e of entites) {
      if (e.inPaperSpace === true) continue
      // Une entite du calque 0 dans un bloc prend le calque de l'insertion.
      const calque = e.layer && !(e.layer === '0' && calqueParent) ? e.layer : (calqueParent ?? '0')
      parCalque.set(calque, (parCalque.get(calque) ?? 0) + 1)
      const tr = (p: Point) => appliquer(m, p)

      switch (e.type) {
        case 'LINE': {
          const v = (e.vertices as PointBrut[] | undefined) ?? []
          if (v.length >= 2) ajouter(calque, [tr(pt(v[0])), tr(pt(v[1]))])
          break
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const v = (e.vertices as (PointBrut & { bulge?: number })[] | undefined) ?? []
          if (v.length < 2) break
          const fermee = e.shape === true
          const points: Point[] = [pt(v[0])]
          const n = fermee ? v.length : v.length - 1
          for (let i = 0; i < n; i++) {
            const a = pt(v[i])
            const b = pt(v[(i + 1) % v.length])
            points.push(...pointsRenflement(a, b, nombre(v[i]?.bulge, 0)))
          }
          ajouter(calque, points.map(tr), fermee)
          break
        }
        case 'CIRCLE': {
          const r = nombre(e.radius, 0)
          if (r > 0)
            ajouter(calque, pointsArc(pt(e.center as PointBrut), r, 0, 2 * Math.PI).map(tr), true)
          break
        }
        case 'ARC': {
          const r = nombre(e.radius, 0)
          if (r > 0) {
            ajouter(
              calque,
              pointsArc(
                pt(e.center as PointBrut),
                r,
                nombre(e.startAngle, 0),
                nombre(e.endAngle, 2 * Math.PI),
              ).map(tr),
            )
          }
          break
        }
        case 'ELLIPSE': {
          const c = pt(e.center as PointBrut)
          const [ax, ay] = pt(e.majorAxisEndPoint as PointBrut)
          const ratio = nombre(e.axisRatio, 1)
          const debut = nombre(e.startAngle, 0)
          let fin = nombre(e.endAngle, 2 * Math.PI)
          while (fin <= debut) fin += 2 * Math.PI
          const n = segmentsArc(fin - debut)
          const points: Point[] = []
          for (let i = 0; i <= n; i++) {
            const t = debut + ((fin - debut) * i) / n
            const u = Math.cos(t)
            const w = Math.sin(t) * ratio
            points.push([c[0] + ax * u - ay * w, c[1] + ay * u + ax * w])
          }
          ajouter(calque, points.map(tr))
          break
        }
        case 'SPLINE': {
          // Approximation par les points de passage, a defaut par le polygone
          // de controle : suffisant pour un fond de plan.
          const v = ((e.fitPoints ?? e.controlPoints) as PointBrut[] | undefined) ?? []
          ajouter(
            calque,
            v.map((p) => tr(pt(p))),
            e.closed === true,
          )
          break
        }
        case 'SOLID':
        case '3DFACE': {
          const v = ((e.points ?? e.vertices) as PointBrut[] | undefined) ?? []
          if (v.length >= 3) {
            // L'ordre des sommets d'un SOLID est en Z : 0, 1, 3, 2.
            const ordre = e.type === 'SOLID' && v.length === 4 ? [v[0], v[1], v[3], v[2]] : v
            ajouter(
              calque,
              ordre.map((p) => tr(pt(p))),
              true,
            )
          }
          break
        }
        case 'TEXT':
        case 'MTEXT': {
          const contenu = texteBrut(String(e.text ?? ''))
          if (!contenu) break
          const origine = tr(pt((e.type === 'TEXT' ? e.startPoint : e.position) as PointBrut))
          textes.push({
            calque,
            x: origine[0],
            y: origine[1],
            hauteur: nombre(e.type === 'TEXT' ? e.textHeight : e.height, 1) * echelle(m),
            rotation: nombre(e.rotation, 0) + rotationDe(m),
            contenu,
          })
          break
        }
        case 'INSERT':
        case 'DIMENSION': {
          const nom = String((e.type === 'INSERT' ? e.name : e.block) ?? '')
          const bloc = blocs[nom]
          if (!bloc || profondeur >= PROFONDEUR_MAX) break
          const base = pt(bloc.position as PointBrut | undefined)
          if (e.type === 'DIMENSION') {
            // Le bloc anonyme d'une cotation est deja dans le repere du dessin.
            parcourir(bloc.entities as unknown as Brut[], m, calque, profondeur + 1)
            break
          }
          const colonnes = Math.max(1, nombre(e.columnCount, 1))
          const rangees = Math.max(1, nombre(e.rowCount, 1))
          const rotation = nombre(e.rotation, 0)
          for (let i = 0; i < colonnes; i++) {
            for (let j = 0; j < rangees; j++) {
              const p = pt(e.position as PointBrut)
              const r = (rotation * Math.PI) / 180
              const dx = i * nombre(e.columnSpacing, 0)
              const dy = j * nombre(e.rowSpacing, 0)
              const position: Point = [
                p[0] + dx * Math.cos(r) - dy * Math.sin(r),
                p[1] + dx * Math.sin(r) + dy * Math.cos(r),
              ]
              const mi = matriceInsertion(
                position,
                rotation,
                nombre(e.xScale, 1),
                nombre(e.yScale, 1),
                base,
              )
              parcourir(bloc.entities as unknown as Brut[], composer(m, mi), calque, profondeur + 1)
            }
          }
          break
        }
        default:
          break
      }
    }
  }

  parcourir(dxf.entities as unknown as Brut[], IDENTITE, null, 0)
  Object.assign(ignorees, typesNonDessines(source))
  if (polylignes.length === 0) {
    throw new ErreurImport(
      'Aucun trait dessinable dans ce DXF : le plan est-il dans l’espace objet ?',
    )
  }

  const calques: Calque[] = [...parCalque.entries()]
    .map(([nom, entites]) => {
      const t = tableCalques[nom]
      return { nom, entites, visibleParDefaut: !t || (t.visible !== false && t.frozen !== true) }
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  return { polylignes, textes, calques, ignorees }
}

const DESSINES = new Set([
  'LINE',
  'LWPOLYLINE',
  'POLYLINE',
  'VERTEX',
  'SEQEND',
  'CIRCLE',
  'ARC',
  'ELLIPSE',
  'SPLINE',
  'SOLID',
  '3DFACE',
  'TEXT',
  'MTEXT',
  'INSERT',
  'DIMENSION',
  'POINT',
  'ATTDEF',
  'ATTRIB',
  'BLOCK',
  'ENDBLK',
  'SECTION',
  'ENDSEC',
  'TABLE',
  'ENDTAB',
  'EOF',
])

/**
 * Types d'entites presents dans le fichier mais non dessines. Le lecteur les
 * ecarte sans trace ; on les compte sur le texte brut, dans les sections des
 * blocs et des entites, pour le dire a l'utilisateur.
 */
function typesNonDessines(source: string): Record<string, number> {
  const lignes = source.split(/\r?\n/)
  const compte: Record<string, number> = {}
  let section = ''
  for (let i = 0; i + 1 < lignes.length; i += 2) {
    const code = (lignes[i] as string).trim()
    const valeur = (lignes[i + 1] as string).trim()
    if (code === '2' && lignes[i - 1]?.trim() === 'SECTION') section = valeur
    if (code !== '0' || (section !== 'ENTITIES' && section !== 'BLOCKS')) continue
    if (!DESSINES.has(valeur)) compte[valeur] = (compte[valeur] ?? 0) + 1
  }
  return compte
}

/* -------------------------------------------------------------------------- */
/* Cadrage et rendu                                                           */
/* -------------------------------------------------------------------------- */

export type Boite = { minX: number; minY: number; maxX: number; maxY: number }

function quantile(tries: number[], q: number): number {
  return tries[
    Math.min(tries.length - 1, Math.max(0, Math.floor(q * (tries.length - 1))))
  ] as number
}

/**
 * Cadre du dessin. Un trait egare a des kilometres, frequent dans les
 * fichiers de DAO, reduirait le plan a un point : quand l'etendue complete
 * depasse vingt fois celle de l'essentiel des traits, on cadre sur
 * l'essentiel (centiles 1 a 99), avec une marge.
 */
export function cadrer(polylignes: readonly Polyligne[]): Boite {
  const xs: number[] = []
  const ys: number[] = []
  for (const p of polylignes)
    for (const [x, y] of p.points) {
      xs.push(x)
      ys.push(y)
    }
  if (xs.length === 0) return { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  xs.sort((a, b) => a - b)
  ys.sort((a, b) => a - b)
  const complet: Boite = {
    minX: xs[0] as number,
    minY: ys[0] as number,
    maxX: xs[xs.length - 1] as number,
    maxY: ys[ys.length - 1] as number,
  }
  const essentiel: Boite = {
    minX: quantile(xs, 0.01),
    minY: quantile(ys, 0.01),
    maxX: quantile(xs, 0.99),
    maxY: quantile(ys, 0.99),
  }
  const etendue = (b: Boite) => Math.max(b.maxX - b.minX, b.maxY - b.minY)
  if (etendue(essentiel) > 0 && etendue(complet) > 20 * etendue(essentiel)) {
    const marge = etendue(essentiel) * 0.05
    return {
      minX: essentiel.minX - marge,
      minY: essentiel.minY - marge,
      maxX: essentiel.maxX + marge,
      maxY: essentiel.maxY + marge,
    }
  }
  return complet
}

const echapper = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Marge blanche autour du dessin, en pixels. */
const MARGE_PX = 24

export type RenduSvg = { svg: string; largeur: number; hauteur: number }

/**
 * Dessin SVG, en pixels, le plus grand cote valant `coteMax`. L'axe Y du DXF
 * monte, celui du SVG descend : il est retourne. Les coordonnees sont
 * arrondies au dixieme de pixel, ce qui allege le fichier sans perte visible.
 */
export function dessinVersSvg(
  dessin: DessinDxf,
  calquesVisibles: ReadonlySet<string>,
  coteMax = 4096,
): RenduSvg {
  const visibles = dessin.polylignes.filter((p) => calquesVisibles.has(p.calque))
  if (visibles.length === 0)
    throw new ErreurImport('Aucun calque visible : en afficher au moins un.')
  const b = cadrer(visibles)
  const l = Math.max(b.maxX - b.minX, 1e-9)
  const h = Math.max(b.maxY - b.minY, 1e-9)
  const k = (coteMax - 2 * MARGE_PX) / Math.max(l, h)
  const largeur = Math.max(1, Math.round(l * k + 2 * MARGE_PX))
  const hauteur = Math.max(1, Math.round(h * k + 2 * MARGE_PX))
  const X = (x: number) => Math.round(((x - b.minX) * k + MARGE_PX) * 10) / 10
  const Y = (y: number) => Math.round(((b.maxY - y) * k + MARGE_PX) * 10) / 10

  const chemins = visibles.map(
    (p) => `M${p.points.map(([x, y]) => `${X(x)} ${Y(y)}`).join('L')}${p.fermee ? 'Z' : ''}`,
  )
  const textes = dessin.textes
    .filter((t) => calquesVisibles.has(t.calque) && t.hauteur * k >= 6)
    .map((t) => {
      const x = X(t.x)
      const y = Y(t.y)
      const rotation = t.rotation ? ` transform="rotate(${-t.rotation} ${x} ${y})"` : ''
      return `<text x="${x}" y="${y}" font-size="${Math.round(t.hauteur * k * 10) / 10}"${rotation}>${echapper(t.contenu)}</text>`
    })

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}">` +
    `<rect width="100%" height="100%" fill="${FOND_DE_PLAN.fond}"/>` +
    `<path d="${chemins.join('')}" fill="none" stroke="${FOND_DE_PLAN.trait}" stroke-width="${FOND_DE_PLAN.epaisseur}" stroke-linejoin="round" stroke-linecap="round"/>` +
    (textes.length > 0
      ? `<g fill="${FOND_DE_PLAN.texte}" font-family="sans-serif">${textes.join('')}</g>`
      : '') +
    `</svg>`
  return { svg, largeur, hauteur }
}
