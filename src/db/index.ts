/**
 * Client de base de donnees.
 *
 * Trois options ne sont pas negociables en environnement serverless :
 *
 *   prepare: false   pgBouncer en mode transaction ne supporte pas les
 *                    requetes preparees. Sans cette option, l'application
 *                    fonctionne en local et echoue en production.
 *   max: 1           une connexion par instance de fonction. Sans cela, les
 *                    invocations concurrentes epuisent les soixante connexions
 *                    de l'offre gratuite.
 *   casing           conversion camelCase vers snake_case, alignee sur
 *                    drizzle.config.ts.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '@/lib/env'
import * as schema from '@/db/schema'

let cache: ReturnType<typeof creer> | undefined

function creer() {
  const client = postgres(env().DATABASE_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  return drizzle(client, { schema, casing: 'snake_case' })
}

/** Instance partagee. Creee paresseusement pour ne pas ouvrir de connexion a l'import. */
export function db() {
  cache ??= creer()
  return cache
}

/**
 * Connexion dediee aux scripts hors ligne, peuplement et verification.
 *
 * Elle emprunte la connexion DIRECTE et autorise plusieurs connexions : un
 * script de peuplement n'a pas les contraintes du serverless, et l'insertion
 * en masse gagne a ne pas etre bridee a une seule connexion.
 */
export function dbScript() {
  const client = postgres(env().DIRECT_URL, { max: 4, onnotice: () => {} })
  const instance = drizzle(client, { schema, casing: 'snake_case' })
  return { db: instance, client, fermer: () => client.end({ timeout: 5 }) }
}
