/**
 * Reconnaissance du format d'un fichier de plan, par son extension ET ses
 * premiers octets : une extension se renomme, une signature beaucoup moins.
 */

import type { FormatPlan } from '@/db/schema'

export type FormatReconnu = FormatPlan | 'DWG'

/** Extensions proposees par le selecteur de fichier. */
export const EXTENSIONS_PLAN = '.dxf,.dwg,.pdf,.svg,.png,.jpg,.jpeg,.webp'

/** Au-dela, un fichier n'est pas un plan de niveau mais une archive de projet. */
export const TAILLE_MAX_SOURCE = 80 * 1024 * 1024

const commence = (o: Uint8Array, motif: number[]) => motif.every((v, i) => o[i] === v)
const texte = (o: Uint8Array) => new TextDecoder('latin1').decode(o.subarray(0, 512))

export function reconnaitreFormat(nom: string, entete: Uint8Array): FormatReconnu | null {
  const ext = nom.toLowerCase().split('.').pop() ?? ''
  const t = texte(entete)
  if (/^AC10\d\d/.test(t)) return 'DWG'
  if (t.startsWith('%PDF-')) return 'PDF'
  if (commence(entete, [0x89, 0x50, 0x4e, 0x47])) return 'IMAGE'
  if (commence(entete, [0xff, 0xd8, 0xff])) return 'IMAGE'
  if (t.startsWith('RIFF') && t.slice(8, 12) === 'WEBP') return 'IMAGE'
  const sansProlog = t.replace(/<\?xml[^>]*>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/gi, '').trimStart()
  if (ext === 'svg' && /^<svg[\s>]/i.test(sansProlog)) {
    return 'SVG'
  }
  // Un DXF texte commence par le groupe 0 SECTION, apres un eventuel commentaire 999.
  if (ext === 'dxf' && /^\s*(999\s*\r?\n[^\n]*\r?\n\s*)?0\s*\r?\n\s*SECTION/.test(t)) return 'DXF'
  if (ext === 'dxf' && t.startsWith('AutoCAD Binary DXF')) return null
  return null
}

/** Message d'aide quand le fichier n'est pas reconnu. */
export function aideFormat(nom: string, entete: Uint8Array): string {
  const t = texte(entete)
  if (t.startsWith('AutoCAD Binary DXF')) {
    return 'Ce DXF est enregistré en binaire. Le réenregistrer en DXF ASCII (texte) depuis AutoCAD.'
  }
  return `Format non reconnu pour « ${nom} ». Formats acceptés : DXF, PDF, SVG, PNG, JPEG, WebP.`
}
