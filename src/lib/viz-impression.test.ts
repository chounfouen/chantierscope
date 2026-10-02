import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { IMPRESSION, VARIABLES_ENCRE } from '@/lib/viz-impression'

const CSS = readFileSync(resolve(import.meta.dirname, '../app/globals.css'), 'utf8')
/** Premier bloc `:root` qui definit la variable : le theme clair. */
function valeur(variable: string): string {
  const m = CSS.match(new RegExp(`${variable}:\\s*([^;]+);`))
  if (!m?.[1]) throw new Error(`Variable absente : ${variable}`)
  return m[1].trim()
}

function oklchHex(texte: string): string {
  const m = texte.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/)
  if (!m) throw new Error(`Pas une couleur oklch : ${texte}`)
  const [L, C, h] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lineaire = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ]
  const gamma = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
    return Math.round(Math.min(1, Math.max(0, v)) * 255)
  }
  return `#${lineaire.map((x) => gamma(x).toString(16).padStart(2, '0')).join('')}`
}

describe('palette d impression', () => {
  it('reprend exactement les huit teintes du theme clair', () => {
    IMPRESSION.series.forEach((hex, i) => expect(valeur(`--serie-${i + 1}`)).toBe(hex))
  })

  it('reprend exactement les etats du theme clair', () => {
    const variables = {
      NON_COMMENCE: '--etat-neant',
      EN_COURS: '--etat-cours',
      ACHEVE: '--etat-acheve',
      EN_RETARD: '--etat-retard',
      CRITIQUE: '--etat-critique',
      NON_TRAVAILLE: '--etat-chome',
    } as const
    for (const [etat, variable] of Object.entries(variables)) {
      expect(valeur(variable)).toBe(IMPRESSION.etats[etat as keyof typeof variables])
    }
  })

  it('convertit fidelement les encres oklch', () => {
    for (const [cle, variable] of Object.entries(VARIABLES_ENCRE)) {
      expect(oklchHex(valeur(variable))).toBe(IMPRESSION[cle as keyof typeof VARIABLES_ENCRE])
    }
  })
})
