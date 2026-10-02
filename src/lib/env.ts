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

  /**
   * Base dediee a la suite d'integration. Absente en production : la suite
   * ne s'y execute pas.
   */
  DATABASE_URL_TEST: z.string().optional(),
  DIRECT_URL_TEST: z.string().optional(),

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

  const resultat = Schema.safeParse(sansValeursVides(process.env))
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

/**
 * Une variable declaree vide vaut une variable absente.
 *
 * `.env.example` declare chaque variable, y compris celles reservees a la
 * production, avec une valeur vide. Sans cette equivalence, recopier
 * l'exemple comme le demande le message d'erreur ferait echouer la
 * validation des variables optionnelles typees, comme une URL.
 */
function sansValeursVides(brut: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(brut).filter((e): e is [string, string] => e[1] !== undefined && e[1] !== ''),
  )
}

/** Vrai en developpement local. Sert a n'exposer certains outils qu'en local. */
export function enDeveloppement(): boolean {
  return env().NODE_ENV === 'development'
}

/** Vrai lorsque le code s'execute sous la suite de tests. */
export function sousTest(): boolean {
  return process.env['VITEST'] === 'true'
}

/**
 * URL de connexion a employer, selon le contexte.
 *
 * Sous la suite de tests, la base dediee remplace la base de developpement :
 * les tests d'integration detruisent et repeuplent leur base, et ne doivent
 * jamais toucher au jeu de demonstration.
 */
export function urlBase(direct = false): string {
  const e = env()
  if (sousTest()) {
    const url = direct ? e.DIRECT_URL_TEST : e.DATABASE_URL_TEST
    if (!url) {
      throw new Error(
        'DATABASE_URL_TEST est absente. La suite d integration a besoin d une base dediee : ' +
          'voir .env.example.',
      )
    }
    return url
  }
  return direct ? e.DIRECT_URL : e.DATABASE_URL
}
