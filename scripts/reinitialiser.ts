/**
 * Remise a zero de la base de DEVELOPPEMENT.
 *
 * Supprime le schema public et le recree. A n'executer que sur la base locale
 * jetable : le garde-fou ci-dessous refuse toute base qui ne tourne pas sur la
 * machine locale.
 */

import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local', quiet: true })

const url = process.env['DIRECT_URL']
if (!url) throw new Error('DIRECT_URL absente.')

const hote = new URL(url).hostname
if (hote !== 'localhost' && hote !== '127.0.0.1') {
  throw new Error(
    `Refus de reinitialiser une base distante (${hote}). ` +
      'Cette commande est reservee a la base locale de developpement.',
  )
}

const client = postgres(url, { max: 1, onnotice: () => {} })
await client.unsafe('drop schema if exists public cascade')
await client.unsafe('drop schema if exists drizzle cascade')
await client.unsafe('create schema public')
await client.end()
console.log('Schema public recree. Lancer les migrations.')
