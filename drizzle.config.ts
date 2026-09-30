import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

/**
 * Les migrations emprunte la connexion DIRECTE, et non le pooler.
 * pgBouncer en mode transaction ne supporte pas le DDL transactionnel.
 */
const url = process.env['DIRECT_URL']
if (!url) throw new Error('DIRECT_URL absente. Copier .env.example en .env.local.')

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
})
