/**
 * Meteo d'une journee, pour precharger l'etape meteo du releve.
 *
 * Le chef de chantier peut corriger la valeur proposee ; la valeur corrigee
 * est celle qui est enregistree, et la tache nocturne ne la remplace pas.
 * Une indisponibilite d'Open-Meteo n'est pas une erreur : le formulaire reste
 * saisissable a la main, et la tache nocturne completera plus tard.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/db/index'
import { env } from '@/lib/env'
import { exiger, NonAuthentifie, NonAutorise, PEUT_SAISIR } from '@/lib/garde'
import { DateSimple } from '@/lib/releve'
import { relever } from '@/services/meteo'

export const dynamic = 'force-dynamic'

export type ReponseMeteo =
  | {
      disponible: true
      meteoCode: number
      temperatureC: number
      precipitationsMm: number
      rafalesKmh: number
    }
  | { disponible: false }

export async function GET(requete: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: projetId } = await ctx.params
  try {
    await exiger(projetId, PEUT_SAISIR)
  } catch (e) {
    if (e instanceof NonAuthentifie) return new Response(null, { status: 401 })
    if (e instanceof NonAutorise) return new Response(null, { status: 403 })
    throw e
  }

  const date = DateSimple.safeParse(new URL(requete.url).searchParams.get('date'))
  if (!date.success) return Response.json({ erreur: 'Date invalide.' }, { status: 400 })

  const [lieu] = await db().execute<{ latitude: number | null; longitude: number | null }>(sql`
    select latitude::float8 as latitude, longitude::float8 as longitude
      from projet where id = ${projetId}::uuid`)

  const e = env()
  const journees = await relever(
    {
      latitude: lieu?.latitude ?? e.CHANTIER_LATITUDE,
      longitude: lieu?.longitude ?? e.CHANTIER_LONGITUDE,
      fuseau: e.CHANTIER_FUSEAU,
    },
    date.data,
    date.data,
  )
  const m = journees.get(date.data)
  const corps: ReponseMeteo = m
    ? {
        disponible: true,
        meteoCode: m.code,
        temperatureC: m.temperatureMaxC,
        precipitationsMm: m.precipitationsMm,
        rafalesKmh: m.rafalesKmh,
      }
    : { disponible: false }
  return Response.json(corps, { headers: { 'Cache-Control': 'private, max-age=3600' } })
}
