/**
 * Completion de la meteo des releves qui n'en portent pas.
 *
 * Ne touche qu'aux releves sans mesure de pluie et dont la meteo n'a pas ete
 * corrigee sur le terrain : une observation de chantier prime sur le modele.
 * Un releve valide est gele, mais le declencheur de gel admet cette
 * completion, et elle seule : combler une mesure absente n'est pas reecrire
 * une observation.
 */

import { sql } from 'drizzle-orm'
import type { db as instanceDb } from '@/db/index'
import type { JourMeteo } from '@/services/meteo'

type Db = ReturnType<typeof instanceDb>

/** Renvoie le nombre de releves effectivement completes. */
export async function completerMeteoProjet(
  db: Db,
  projetId: string,
  journees: Map<string, JourMeteo>,
): Promise<number> {
  let completes = 0
  for (const [date, m] of journees) {
    // `returning` est indispensable au decompte : sans lui, le pilote renvoie
    // une liste vide quel que soit le nombre de lignes modifiees.
    const lignes = await db.execute<{ id: string }>(sql`
      update releve_journalier
         set meteo_code = ${m.code},
             temperature_c = ${m.temperatureMaxC},
             precipitations_mm = ${m.precipitationsMm},
             rafales_kmh = ${m.rafalesKmh}
       where projet_id = ${projetId}::uuid
         and date = ${date}::date
         and precipitations_mm is null
         and not meteo_corrigee
      returning id`)
    completes += lignes.length
  }
  return completes
}
