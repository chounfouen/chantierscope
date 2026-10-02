/**
 * Refus general de la Row Level Security (migration 0007).
 *
 * On joue le role d'un client de l'API Supabase : un role sans propriete sur
 * les tables, a qui l'on aurait meme accorde les droits SQL de lecture et
 * d'ecriture. La RLS, sans aucune politique, doit tout lui refuser. Le tout
 * dans une transaction annulee : le role de test ne survit pas.
 */

import { afterAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'

const { client, fermer } = dbScript()

afterAll(async () => {
  await fermer()
})

class Annulation extends Error {}

async function enRoleApi<T>(corps: (tx: typeof client) => Promise<T>): Promise<T> {
  let resultat: T | undefined
  await client
    .begin(async (tx) => {
      await tx`create role role_api_essai nologin`
      await tx`grant usage on schema public to role_api_essai`
      await tx`grant select, insert, update, delete on all tables in schema public to role_api_essai`
      await tx`set local role role_api_essai`
      resultat = await corps(tx as unknown as typeof client)
      throw new Annulation()
    })
    .catch((e: unknown) => {
      if (!(e instanceof Annulation)) throw e
    })
  return resultat as T
}

describe('refus general', () => {
  it('le proprietaire, qui est l application, lit les donnees', async () => {
    const [n] = await client<{ n: number }[]>`select count(*)::int as n from projet`
    expect(n?.n).toBeGreaterThan(0)
  })

  it('un role de l API ne lit aucune ligne, meme avec le droit SQL de lecture', async () => {
    const comptes = await enRoleApi(async (tx) => {
      const [p] = await tx<{ n: number }[]>`select count(*)::int as n from projet`
      const [u] = await tx<{ n: number }[]>`select count(*)::int as n from utilisateur`
      const [r] = await tx<{ n: number }[]>`select count(*)::int as n from releve_journalier`
      return [p?.n, u?.n, r?.n]
    })
    expect(comptes).toEqual([0, 0, 0])
  })

  it('un role de l API ne peut rien ecrire', async () => {
    const erreur = await enRoleApi(async (tx) => {
      try {
        await tx`insert into point_de_vue (projet_id, nom)
                 values ('00000000-0000-0000-0000-000000000000', 'intrus')`
        return null
      } catch (e) {
        return (e as { code?: string }).code ?? 'inconnu'
      }
    })
    // 42501 : violation de politique de securite de niveau ligne.
    expect(erreur).toBe('42501')
  })
})
