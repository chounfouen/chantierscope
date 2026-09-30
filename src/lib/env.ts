/**
 * Validation des variables d'environnement, au demarrage.
 *
 * Aucun module ne lit `process.env` directement. Une variable absente ou
 * malformee doit faire echouer le demarrage avec un message explicite, plutot
 * que produire un `undefined` qui remonte jusqu'a une requete SQL et se
 * manifeste en production par une erreur incomprehensible.
 */

import { z } from 'zod'

const Schema = z.object({
  /** Connexion applicative. En production : pooler Supabase, port 6543. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL absente'),
  /** Connexion directe, port 5432. Reservee aux migrations. */
  DIRECT_URL: z.string().min(1, 'DIRECT_URL absente'),

  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET doit faire au moins 32 caracteres'),
  AUTH_URL: z.string().url().optional(),

  /** Coordonnees du chantier, pour le releve meteo. */
  CHANTIER_LATITUDE: z.coerce.number().min(-90).max(90),
  CHANTIER_LONGITUDE: z.coerce.number().min(-180).max(180),
  CHANTIER_FUSEAU: z.string().min(1),

  CRON_SECRET: z.string().min(1),

  /** Production uniquement. */
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_BUCKET_PHOTOS: z.string().default('photos'),

  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type Env = z.infer<typeof Schema>

let cache: Env | undefined

/**
 * Environnement valide. Appelee paresseusement : importer ce module ne doit pas
 * suffire a faire echouer un contexte qui n'a pas besoin de la base, comme la
 * compilation d'un composant client.
 */
export function env(): Env {
  if (cache) return cache

  const resultat = Schema.safeParse(process.env)
  if (!resultat.success) {
    const details = resultat.error.issues
      .map((issue) => `  ${issue.path.join('.')} : ${issue.message}`)
      .join('\n')
    throw new Error(
      `Variables d'environnement invalides :\n${details}\n\n` +
        'Copier .env.example en .env.local et renseigner les valeurs manquantes.',
    )
  }

  cache = resultat.data
  return cache
}

/** Vrai en developpement local. Sert a n'exposer certains outils qu'en local. */
export function enDeveloppement(): boolean {
  return env().NODE_ENV === 'development'
}
