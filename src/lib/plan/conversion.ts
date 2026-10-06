'use client'

/**
 * Conversion d'un fichier de plan en image WebP, dans le navigateur.
 *
 * Tout format importe finit en une image : le serveur ne recoit, ne verifie
 * et ne sert qu'un seul type de fichier, deja accepte pour les photos. Un SVG
 * ou un PDF n'est donc jamais servi tel quel depuis l'origine de
 * l'application, ou il pourrait porter du script ; il est dessine dans une
 * toile, ce qui n'execute rien.
 *
 * Le DXF est lu et dessine par `dxf.ts` ; le PDF par pdf.js, charge a la
 * demande seulement, pour ne pas alourdir les autres ecrans.
 */

import { dessinVersSvg, ErreurImport, lireDxf, type DessinDxf } from '@/lib/plan/dxf'
import { aideFormat, reconnaitreFormat, TAILLE_MAX_SOURCE } from '@/lib/plan/format'
import type { FormatPlan } from '@/db/schema'

/** Plus grand cote de l'image produite, en pixels : lisible en plein ecran, leger a servir. */
export const COTE_PLAN = 4096
const QUALITE_PLAN = 0.88

export type Source =
  | { format: 'DXF'; nom: string; dessin: DessinDxf }
  | { format: 'PDF'; nom: string; donnees: Uint8Array; pages: number }
  | { format: 'SVG' | 'IMAGE'; nom: string; fichier: File }

export type Options = { calquesVisibles?: ReadonlySet<string>; page?: number }

export type ImagePlan = { blob: Blob; largeur: number; hauteur: number; format: FormatPlan }

/** Lit le texte d'un DXF : UTF-8 depuis AutoCAD 2007, Windows-1252 avant. */
function decoderDxf(octets: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(octets)
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(octets) : utf8
}

/**
 * pdf.js en version « legacy » : la version courante emploie des fonctions
 * JavaScript trop recentes pour une partie des navigateurs en service sur
 * les chantiers.
 */
async function chargerPdfJs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  return pdfjs
}

/** Premiere etape : reconnaitre le fichier et lire ce qu'il faut pour proposer des options. */
export async function analyser(fichier: File): Promise<Source> {
  if (fichier.size > TAILLE_MAX_SOURCE) {
    throw new ErreurImport('Fichier trop volumineux pour un plan de niveau (80 Mo au plus).')
  }
  const octets = new Uint8Array(await fichier.arrayBuffer())
  const format = reconnaitreFormat(fichier.name, octets.subarray(0, 512))
  switch (format) {
    case null:
      throw new ErreurImport(aideFormat(fichier.name, octets.subarray(0, 512)))
    case 'DWG':
      throw new ErreurImport(
        'Le format DWG est fermé et ne se lit pas dans le navigateur. Dans AutoCAD : Fichier, Enregistrer sous, type « DXF », puis importer ce fichier. Un export PDF convient aussi.',
      )
    case 'DXF':
      return { format, nom: fichier.name, dessin: lireDxf(decoderDxf(octets)) }
    case 'PDF': {
      const pdfjs = await chargerPdfJs()
      const tache = pdfjs.getDocument({ data: octets.slice() })
      const pages = (await tache.promise).numPages
      await tache.destroy()
      return { format, nom: fichier.name, donnees: octets, pages }
    }
    default:
      return { format, nom: fichier.name, fichier }
  }
}

function toile(largeur: number, hauteur: number) {
  const t = document.createElement('canvas')
  t.width = largeur
  t.height = hauteur
  const ctx = t.getContext('2d')
  if (!ctx) throw new ErreurImport('Conversion impossible sur ce navigateur.')
  // Fond blanc : un PNG ou un SVG transparent resterait lisible en theme sombre.
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, largeur, hauteur)
  ctx.imageSmoothingQuality = 'high'
  return { t, ctx }
}

async function encoder(t: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((ok) => t.toBlob(ok, 'image/webp', QUALITE_PLAN))
  if (!blob || blob.type !== 'image/webp') {
    throw new ErreurImport(
      'Ce navigateur ne sait pas produire d’image WebP : utiliser Chrome, Edge ou Firefox.',
    )
  }
  return blob
}

/** Dimensions ramenees au plus grand cote, sans agrandir une image matricielle. */
function cadrer(l: number, h: number, agrandir: boolean) {
  const k = Math.min(COTE_PLAN / Math.max(l, h), agrandir ? Infinity : 1)
  return { largeur: Math.max(1, Math.round(l * k)), hauteur: Math.max(1, Math.round(h * k)) }
}

/** Dessine une image chargee par URL dans une toile, puis l'encode. */
async function depuisImage(url: string, l: number, h: number, agrandir: boolean) {
  const img = new Image()
  img.decoding = 'async'
  img.src = url
  await img.decode().catch(() => {
    throw new ErreurImport('Image illisible.')
  })
  const lo = l || img.naturalWidth
  const ho = h || img.naturalHeight
  if (!lo || !ho) throw new ErreurImport('Dimensions de l’image introuvables.')
  const { largeur, hauteur } = cadrer(lo, ho, agrandir)
  const { t, ctx } = toile(largeur, hauteur)
  ctx.drawImage(img, 0, 0, largeur, hauteur)
  return { blob: await encoder(t), largeur, hauteur }
}

/** Dimensions intrinseques d'un SVG, lues sur sa racine. */
function dimensionsSvg(texte: string): [number, number] {
  const racine = /<svg\b[^>]*>/i.exec(texte)?.[0] ?? ''
  const attr = (n: string) =>
    Number.parseFloat(new RegExp(`\\b${n}="([\\d.]+)`).exec(racine)?.[1] ?? '')
  const vb = /viewBox="[\d.\s,-]*?([\d.]+)[\s,]+([\d.]+)"/.exec(racine)
  const l = attr('width') || Number(vb?.[1]) || 0
  const h = attr('height') || Number(vb?.[2]) || 0
  return [l, h]
}

/** Seconde etape : produire l'image, avec les options choisies. */
export async function convertir(source: Source, options: Options = {}): Promise<ImagePlan> {
  switch (source.format) {
    case 'DXF': {
      const calques =
        options.calquesVisibles ??
        new Set(source.dessin.calques.filter((c) => c.visibleParDefaut).map((c) => c.nom))
      const r = dessinVersSvg(source.dessin, calques, COTE_PLAN)
      const url = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }))
      try {
        return { ...(await depuisImage(url, r.largeur, r.hauteur, true)), format: 'DXF' }
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    case 'SVG': {
      const texte = await source.fichier.text()
      const [l, h] = dimensionsSvg(texte)
      const url = URL.createObjectURL(source.fichier)
      try {
        return { ...(await depuisImage(url, l, h, true)), format: 'SVG' }
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    case 'IMAGE': {
      const url = URL.createObjectURL(source.fichier)
      try {
        return { ...(await depuisImage(url, 0, 0, false)), format: 'IMAGE' }
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    case 'PDF': {
      const pdfjs = await chargerPdfJs()
      const tache = pdfjs.getDocument({ data: source.donnees.slice() })
      try {
        const doc = await tache.promise
        const page = await doc.getPage(Math.min(Math.max(1, options.page ?? 1), doc.numPages))
        const base = page.getViewport({ scale: 1 })
        const k = COTE_PLAN / Math.max(base.width, base.height)
        const vue = page.getViewport({ scale: k })
        const largeur = Math.round(vue.width)
        const hauteur = Math.round(vue.height)
        const { t, ctx } = toile(largeur, hauteur)
        await page.render({ canvas: t, canvasContext: ctx, viewport: vue }).promise
        return { blob: await encoder(t), largeur, hauteur, format: 'PDF' }
      } finally {
        await tache.destroy()
      }
    }
  }
}
