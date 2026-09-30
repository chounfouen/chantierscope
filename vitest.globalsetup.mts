/**
 * Preparation de la base d'integration, une fois par execution de la suite.
 *
 * La base de test est detruite puis reconstruite depuis les migrations et le
 * peuplement. Elle est distincte de la base de developpement : la suite
 * d'integration ecrit, et ne doit jamais alterer le jeu de demonstration.
 */

import { execFileSync } from 'node:child_process'
import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local', quiet: true })

export async function setup(): Promise<void> {
  const url = process.env['DIRECT_URL_TEST']
  if (!url) {
    throw new Error(
      'DIRECT_URL_TEST est absente de .env.local. La suite d integration a besoin ' +
        'd une base dediee. Voir .env.example.',
    )
  }

  const hote = new URL(url).hostname
  if (hote !== 'localhost' && hote !== '127.0.0.1') {
    throw new Error(`Refus de reconstruire une base distante (${hote}).`)
  }

  const debut = Date.now()
  const client = postgres(url, { max: 1, onnotice: () => {} })
  await client.unsafe('drop schema if exists public cascade')
  await client.unsafe('drop schema if exists drizzle cascade')
  await client.unsafe('create schema public')
  await client.end()

  // Les migrations et le peuplement s'executent dans des processus separes,
  // avec l'environnement pointe sur la base de test.
  const environnement = {
    ...process.env,
    DATABASE_URL: process.env['DATABASE_URL_TEST'] as string,
    DIRECT_URL: url,
    VITEST: 'true',
  }
  const options = { env: environnement, stdio: 'pipe' as const }

  execFileSync('npx', ['drizzle-kit', 'migrate'], options)
  execFileSync('npx', ['tsx', 'src/db/seed/index.ts'], options)

  console.log(`Base d integration prete en ${((Date.now() - debut) / 1000).toFixed(1)} s`)
}
