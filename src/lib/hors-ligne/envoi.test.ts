import { describe, expect, it } from 'vitest'
import { adresseEnvoi, classer, envoyerReleve } from '@/lib/hors-ligne/envoi'
import type { ReleveSaisi } from '@/lib/releve'

const RELEVE = { id: '0f0e0d0c-0b0a-4908-8706-050403020100' } as ReleveSaisi

function reponse(statut: number, corps: unknown): Response {
  return new Response(typeof corps === 'string' ? corps : JSON.stringify(corps), { status: statut })
}

describe('classement de la reponse du serveur', () => {
  it('un releve accepte est enregistre', async () => {
    const r = await classer(
      reponse(200, { ok: true, releveId: 'r1', statut: 'SOUMIS', cree: true }),
    )
    expect(r).toEqual({ issue: 'enregistre', releveId: 'r1', statut: 'SOUMIS', cree: true })
  })

  it('un conflit est un refus definitif, avec le message du serveur', async () => {
    const r = await classer(reponse(409, { ok: false, code: 'CONFLIT', message: 'Existe déjà.' }))
    expect(r).toEqual({ issue: 'refuse', message: 'Existe déjà.' })
  })

  it('une saisie invalide est refusee avec le detail par champ', async () => {
    const r = await classer(
      reponse(400, { ok: false, code: 'INVALIDE', message: 'Incomplet.', champs: { date: 'x' } }),
    )
    expect(r).toEqual({ issue: 'refuse', message: 'Incomplet.', champs: { date: 'x' } })
  })

  it('un droit refuse est definitif', async () => {
    const r = await classer(reponse(403, { ok: false, code: 'NON_AUTORISE', message: 'Non.' }))
    expect(r.issue).toBe('refuse')
  })

  it('une session expiree est reportee : le releve repartira apres reconnexion', async () => {
    const r = await classer(
      reponse(401, { ok: false, code: 'NON_AUTHENTIFIE', message: 'Expirée.' }),
    )
    expect(r).toMatchObject({ issue: 'reporte', cause: 'session' })
  })

  it('une erreur serveur est reportee', async () => {
    const r = await classer(reponse(500, { ok: false, code: 'ERREUR', message: 'Plus tard.' }))
    expect(r).toMatchObject({ issue: 'reporte', cause: 'serveur' })
  })

  it('une page HTML de portail captif est reportee, pas prise pour un succes', async () => {
    const r = await classer(reponse(200, '<html>Connexion au wifi</html>'))
    expect(r).toMatchObject({ issue: 'reporte', cause: 'serveur' })
  })
})

describe('envoi', () => {
  it('poste le releve en JSON a l adresse du projet', async () => {
    let appel: { url: string; init: RequestInit | undefined } | undefined
    const transport = (async (url: string, init?: RequestInit) => {
      appel = { url, init }
      return reponse(200, { ok: true, releveId: RELEVE.id, statut: 'BROUILLON', cree: true })
    }) as typeof fetch

    const r = await envoyerReleve('p1', RELEVE, transport)
    expect(r.issue).toBe('enregistre')
    expect(appel?.url).toBe(adresseEnvoi('p1'))
    expect(appel?.init?.method).toBe('POST')
    expect(JSON.parse(String(appel?.init?.body))).toEqual(RELEVE)
  })

  it('une coupure reseau reporte le releve', async () => {
    const transport = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    const r = await envoyerReleve('p1', RELEVE, transport)
    expect(r).toMatchObject({ issue: 'reporte', cause: 'reseau' })
  })
})
