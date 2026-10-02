/**
 * Reconstruction de la base de test avant les parcours : migrations,
 * peuplement, recalcul. Meme garde-fou que la suite d'integration : jamais
 * sur une base distante.
 */

import { execFileSync } from 'node:child_process'
import { config } from 'dotenv'
import postgres from 'postgres'

export default async function preparation(): Promise<void> {
  config({ path: '.env.local', quiet: true })
  const url = process.env['DIRECT_URL_TEST']
  if (!url) throw new Error('DIRECT_URL_TEST est absente de .env.local.')
  const hote = new URL(url).hostname
  if (hote !== 'localhost' && hote !== '127.0.0.1') {
    throw new Error(`Refus de reconstruire une base distante (${hote}).`)
  }

  const client = postgres(url, { max: 1, onnotice: () => {} })
  await client.unsafe('drop schema if exists public cascade')
  await client.unsafe('drop schema if exists drizzle cascade')
  await client.unsafe('create schema public')
  await client.end()

  const env = {
    ...process.env,
    DATABASE_URL: process.env['DATABASE_URL_TEST'] as string,
    DIRECT_URL: url,
  }
  const options = { env, stdio: 'pipe' as const }
  execFileSync('npx', ['drizzle-kit', 'migrate'], options)
  execFileSync('npx', ['tsx', 'src/db/seed/index.ts'], options)
  execFileSync('npx', ['tsx', 'scripts/recalculer.ts'], options)
}
