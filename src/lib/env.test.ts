import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `env()` met son resultat en cache au niveau du module : chaque cas doit donc
 * repartir d'un module fraichement charge, et restaurer l'environnement
 * ensuite.
 */

const COMPLET = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/base',
  DIRECT_URL: 'postgresql://u:p@localhost:5432/base',
  AUTH_SECRET: 'a'.repeat(32),
  CHANTIER_LATITUDE: '5.3599',
  CHANTIER_LONGITUDE: '-3.9821',
  CHANTIER_FUSEAU: 'Africa/Abidjan',
  CRON_SECRET: 'secret',
}

let original: NodeJS.ProcessEnv

beforeEach(() => {
  original = { ...process.env }
  vi.resetModules()
})

afterEach(() => {
  process.env = original
})

function poser(valeurs: Record<string, string | undefined>): void {
  process.env = { ...valeurs } as NodeJS.ProcessEnv
}

describe('validation de l environnement', () => {
  it('accepte un environnement complet', async () => {
    poser(COMPLET)
    const { env } = await import('@/lib/env')
    expect(env().CHANTIER_LATITUDE).toBe(5.3599)
    expect(env().CHANTIER_FUSEAU).toBe('Africa/Abidjan')
  })

  it('convertit les coordonnees en nombres', async () => {
    poser(COMPLET)
    const { env } = await import('@/lib/env')
    expect(typeof env().CHANTIER_LONGITUDE).toBe('number')
    expect(env().CHANTIER_LONGITUDE).toBe(-3.9821)
  })

  it('applique la valeur par defaut du compartiment de photos', async () => {
    poser(COMPLET)
    const { env } = await import('@/lib/env')
    expect(env().SUPABASE_BUCKET_PHOTOS).toBe('photos')
  })

  it('met le resultat en cache', async () => {
    poser(COMPLET)
    const { env } = await import('@/lib/env')
    expect(env()).toBe(env())
  })

  it('refuse une variable manquante en la nommant', async () => {
    poser({ ...COMPLET, DATABASE_URL: undefined })
    const { env } = await import('@/lib/env')
    expect(() => env()).toThrow(/DATABASE_URL/)
  })

  it('refuse un secret d authentification trop court', async () => {
    poser({ ...COMPLET, AUTH_SECRET: 'trop-court' })
    const { env } = await import('@/lib/env')
    expect(() => env()).toThrow(/AUTH_SECRET/)
  })

  it('refuse une latitude hors bornes', async () => {
    poser({ ...COMPLET, CHANTIER_LATITUDE: '120' })
    const { env } = await import('@/lib/env')
    expect(() => env()).toThrow(/CHANTIER_LATITUDE/)
  })

  it('oriente vers le fichier a copier', async () => {
    poser({})
    const { env } = await import('@/lib/env')
    expect(() => env()).toThrow(/\.env\.example/)
  })

  it('nomme toutes les variables manquantes d un coup', async () => {
    poser({})
    const { env } = await import('@/lib/env')
    try {
      env()
      expect.unreachable('la validation aurait du echouer')
    } catch (e) {
      const message = (e as Error).message
      for (const cle of ['DATABASE_URL', 'DIRECT_URL', 'AUTH_SECRET', 'CRON_SECRET']) {
        expect(message).toContain(cle)
      }
    }
  })

  it('signale le developpement par defaut', async () => {
    poser(COMPLET)
    const { enDeveloppement } = await import('@/lib/env')
    expect(enDeveloppement()).toBe(true)
  })

  it('ne signale pas le developpement en production', async () => {
    poser({ ...COMPLET, NODE_ENV: 'production' })
    const { enDeveloppement } = await import('@/lib/env')
    expect(enDeveloppement()).toBe(false)
  })
})
