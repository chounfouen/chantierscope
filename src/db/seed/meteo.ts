/**
 * Historique meteo du chantier de demonstration.
 *
 * Donnees reelles d'Abidjan sur la periode du chantier, recuperees une fois
 * depuis Open-Meteo puis archivees dans le depot. Le fichier est VERSIONNE, et
 * non ignore : un peuplement qui irait chercher la meteo en ligne ne serait ni
 * reproductible d'une machine a l'autre, ni executable hors ligne.
 *
 * Pour rafraichir l'archive apres un decalage des dates du chantier :
 *   npx tsx src/db/seed/meteo.ts
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATE_ANALYSE, DATE_ORDRE_SERVICE, PROJET } from '@/db/seed/catalogue'
import type { ReleveMeteo } from '@/db/compute/meteo'

const FICHIER = join(import.meta.dirname, 'meteo-abidjan.json')

export type JourneeMeteo = ReleveMeteo & { date: string }

export function chargerMeteo(): Map<string, JourneeMeteo> {
  const brut = JSON.parse(readFileSync(FICHIER, 'utf8')) as JourneeMeteo[]
  return new Map(brut.map((j) => [j.date, j]))
}

/** Recupere l'historique depuis Open-Meteo et le reecrit dans le depot. */
async function rafraichir(): Promise<void> {
  const url = new URL('https://archive-api.open-meteo.com/v1/archive')
  url.searchParams.set('latitude', String(PROJET.latitude))
  url.searchParams.set('longitude', String(PROJET.longitude))
  url.searchParams.set('start_date', DATE_ORDRE_SERVICE)
  url.searchParams.set('end_date', DATE_ANALYSE)
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max',
  )
  url.searchParams.set('timezone', 'Africa/Abidjan')

  const reponse = await fetch(url)
  if (!reponse.ok) throw new Error(`Open-Meteo a repondu ${reponse.status}`)

  const d = (await reponse.json()) as {
    daily: {
      time: string[]
      weather_code: (number | null)[]
      temperature_2m_max: (number | null)[]
      temperature_2m_min: (number | null)[]
      precipitation_sum: (number | null)[]
      wind_gusts_10m_max: (number | null)[]
    }
  }

  const journees: JourneeMeteo[] = d.daily.time.map((date, i) => ({
    date,
    code: d.daily.weather_code[i] ?? 0,
    temperatureMaxC: arrondi(d.daily.temperature_2m_max[i] ?? 30, 1),
    temperatureMinC: arrondi(d.daily.temperature_2m_min[i] ?? 24, 1),
    precipitationsMm: arrondi(d.daily.precipitation_sum[i] ?? 0, 2),
    rafalesKmh: arrondi(d.daily.wind_gusts_10m_max[i] ?? 0, 1),
  }))

  writeFileSync(FICHIER, JSON.stringify(journees, null, 0) + '\n')
  console.log(`${journees.length} journees archivees dans ${FICHIER}`)
}

function arrondi(v: number, d: number): number {
  const f = 10 ** d
  return Math.round(v * f) / f
}

// Point d'entree en ligne de commande. Pas d'await de premier niveau : le
// module doit rester importable par des chargeurs qui transpilent en CommonJS.
if (process.argv[1] === import.meta.filename) {
  rafraichir().catch((e: unknown) => {
    console.error(e)
    process.exitCode = 1
  })
}
