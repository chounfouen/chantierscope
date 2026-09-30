/**
 * Releve meteo depuis Open-Meteo.
 *
 * Service gratuit et sans cle d'API. Deux points d'entree selon l'anciennete
 * de la donnee : l'archive pour l'historique consolide, la prevision pour les
 * jours recents que l'archive n'a pas encore integres, avec environ cinq
 * jours de decalage.
 *
 * Aucune donnee personnelle ne transite : seules des coordonnees de chantier
 * et des dates.
 */

import type { ReleveMeteo } from '@/db/compute/meteo'

export type JourMeteo = ReleveMeteo & { date: string }

const CHAMPS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'wind_gusts_10m_max',
].join(',')

type ReponseOpenMeteo = {
  daily?: {
    time: string[]
    weather_code: (number | null)[]
    temperature_2m_max: (number | null)[]
    temperature_2m_min: (number | null)[]
    precipitation_sum: (number | null)[]
    wind_gusts_10m_max: (number | null)[]
  }
  error?: boolean
  reason?: string
}

export type Coordonnees = { latitude: number; longitude: number; fuseau: string }

/**
 * Meteo journaliere sur une periode.
 *
 * Interroge les deux points d'entree et fusionne : l'archive fait autorite,
 * la prevision complete les journees manquantes.
 */
export async function relever(
  ou: Coordonnees,
  debut: string,
  fin: string,
): Promise<Map<string, JourMeteo>> {
  const [archive, recent] = await Promise.all([
    interroger('https://archive-api.open-meteo.com/v1/archive', ou, debut, fin),
    interroger('https://api.open-meteo.com/v1/forecast', ou, debut, fin),
  ])

  // L'archive prime : elle porte la mesure consolidee plutot que le modele.
  return new Map([...recent, ...archive])
}

async function interroger(
  base: string,
  ou: Coordonnees,
  debut: string,
  fin: string,
): Promise<Map<string, JourMeteo>> {
  const url = new URL(base)
  url.searchParams.set('latitude', String(ou.latitude))
  url.searchParams.set('longitude', String(ou.longitude))
  url.searchParams.set('start_date', debut)
  url.searchParams.set('end_date', fin)
  url.searchParams.set('daily', CHAMPS)
  url.searchParams.set('timezone', ou.fuseau)

  let reponse: Response
  try {
    reponse = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  } catch {
    // Une meteo indisponible ne doit jamais faire echouer la tache nocturne :
    // elle sera relevee le lendemain.
    return new Map()
  }
  if (!reponse.ok) return new Map()

  const donnees = (await reponse.json()) as ReponseOpenMeteo
  if (donnees.error === true || !donnees.daily) return new Map()

  const d = donnees.daily
  const journees = new Map<string, JourMeteo>()
  d.time.forEach((date, i) => {
    const pluie = d.precipitation_sum[i]
    // Une journee sans mesure de pluie n'est pas une journee sans pluie.
    if (pluie === null || pluie === undefined) return
    journees.set(date, {
      date,
      code: d.weather_code[i] ?? 0,
      temperatureMaxC: arrondi(d.temperature_2m_max[i] ?? 30, 1),
      temperatureMinC: arrondi(d.temperature_2m_min[i] ?? 24, 1),
      precipitationsMm: arrondi(pluie, 2),
      rafalesKmh: arrondi(d.wind_gusts_10m_max[i] ?? 0, 1),
    })
  })
  return journees
}

function arrondi(v: number, d: number): number {
  const f = 10 ** d
  return Math.round(v * f) / f
}
