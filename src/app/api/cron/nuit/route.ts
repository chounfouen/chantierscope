/**
 * Tache planifiee nocturne.
 *
 * Trois missions, dans cet ordre :
 *
 *   1. Completer la meteo des releves qui n'en portent pas. Un chef de
 *      chantier qui saisit hors ligne n'a pas pu la precharger.
 *   2. Recalculer integralement le cache de chaque projet, pour rattraper une
 *      eventuelle derive et faire avancer la date d'analyse.
 *   3. Maintenir la base eveillee. L'offre gratuite Supabase suspend une base
 *      restee sept jours sans requete ; une execution quotidienne suffit a
 *      l'eviter.
 *
 * Protegee par un secret partage. En production, Vercel l'envoie dans
 * l'en-tete Authorization.
 */

import { sql } from 'drizzle-orm'
import { db } from '@/db/index'
import { completerMeteoProjet } from '@/db/mutations/meteo'
import { recalculerProjet } from '@/db/mutations/releve'
import { relever } from '@/services/meteo'
import { env } from '@/lib/env'

/** Jamais mise en cache : elle ecrit. */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Rapport = {
  projets: { code: string; instantanes: number; dureeMs: number; avancement: number }[]
  meteoCompletee: number
  dureeTotaleMs: number
}

export async function GET(requete: Request): Promise<Response> {
  const attendu = `Bearer ${env().CRON_SECRET}`
  if (requete.headers.get('authorization') !== attendu) {
    return Response.json({ erreur: 'Non autorise' }, { status: 401 })
  }

  const debut = Date.now()
  const base = db()

  try {
    const meteoCompletee = await completerMeteo(base)

    const projets = await base.execute<{ id: string; code: string }>(
      sql`select id, code from projet order by code`,
    )

    const rapportProjets: Rapport['projets'] = []
    for (const p of projets) {
      const r = await recalculerProjet(base, p.id)
      rapportProjets.push({
        code: p.code,
        instantanes: r.instantanes,
        dureeMs: r.dureeMs,
        avancement: r.avancement,
      })
    }

    const rapport: Rapport = {
      projets: rapportProjets,
      meteoCompletee,
      dureeTotaleMs: Date.now() - debut,
    }
    return Response.json(rapport)
  } catch (erreur) {
    console.error('Echec de la tache nocturne', erreur)
    return Response.json(
      { erreur: erreur instanceof Error ? erreur.message : 'Echec inconnu' },
      { status: 500 },
    )
  }
}

/**
 * Renseigne la meteo des releves qui n'en portent pas.
 *
 * Un releve saisi hors ligne, ou anterieur a la mise en service du relevé
 * automatique, arrive sans mesure. On ne remonte pas au-dela de trente jours :
 * au-dela, la donnee manquante est un fait historique, pas un oubli a
 * rattraper.
 */
type ReleveSansMeteo = {
  projetId: string
  latitude: number
  longitude: number
  date: string
}

async function completerMeteo(base: ReturnType<typeof db>): Promise<number> {
  const manquants = await base.execute<ReleveSansMeteo>(sql`
    select r.projet_id as "projetId",
           p.latitude::float8 as latitude,
           p.longitude::float8 as longitude,
           r.date
      from releve_journalier r
      join projet p on p.id = r.projet_id
     where r.precipitations_mm is null
       and r.date >= current_date - interval '30 days'
     group by 1, 2, 3, 4
     order by r.date`)

  if (manquants.length === 0) return 0

  const parProjet = new Map<string, ReleveSansMeteo[]>()
  for (const m of manquants) {
    const liste = parProjet.get(m.projetId) ?? []
    liste.push(m)
    parProjet.set(m.projetId, liste)
  }

  let completes = 0
  for (const [projetId, lignes] of parProjet) {
    const premiere = lignes[0]
    const derniere = lignes[lignes.length - 1]
    if (!premiere || !derniere) continue

    const journees = await relever(
      {
        latitude: premiere.latitude,
        longitude: premiere.longitude,
        fuseau: env().CHANTIER_FUSEAU,
      },
      premiere.date,
      derniere.date,
    )

    completes += await completerMeteoProjet(base, projetId, journees)
  }
  return completes
}
