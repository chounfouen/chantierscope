import { describe, expect, it } from 'vitest'
import { televerserPhoto, type PhotoAEnvoyer } from '@/lib/photos/televersement'

const PHOTO: PhotoAEnvoyer = {
  id: 'ph',
  releveId: 'r',
  image: new Blob(['image']),
  vignette: new Blob(['vignette']),
  largeur: 1600,
  hauteur: 1200,
  priseLe: '2026-10-01T09:00:00.000Z',
  legende: 'Facade nord',
}

function transport(statuts: { prep?: number; depot?: number; conf?: number } = {}) {
  const appels: { url: string; methode: string }[] = []
  const t = (async (url: string, init?: RequestInit) => {
    appels.push({ url, methode: init?.method ?? 'GET' })
    if (url.endsWith('/photos')) {
      const depot = (u: string) => ({
        url: u,
        methode: 'PUT',
        entetes: { 'Content-Type': 'image/webp' },
      })
      return new Response(
        JSON.stringify(
          statuts.prep && statuts.prep !== 200
            ? { message: 'Refusé.' }
            : { image: depot('/depot/image'), vignette: depot('/depot/vignette') },
        ),
        { status: statuts.prep ?? 200 },
      )
    }
    if (url.startsWith('/depot/')) return new Response(null, { status: statuts.depot ?? 200 })
    return new Response(JSON.stringify({ ok: true }), { status: statuts.conf ?? 200 })
  }) as typeof fetch
  return { t, appels }
}

describe('televersement d une photo', () => {
  it('prepare, depose les deux fichiers, puis confirme', async () => {
    const { t, appels } = transport()
    expect(await televerserPhoto('p', PHOTO, t)).toEqual({ issue: 'enregistre' })
    expect(appels.map((a) => `${a.methode} ${a.url}`)).toEqual([
      'POST /api/projet/p/photos',
      'PUT /depot/image',
      'PUT /depot/vignette',
      'PUT /api/projet/p/photos/ph',
    ])
  })

  it('un depot interrompu est reporte, sans confirmation', async () => {
    const { t, appels } = transport({ depot: 500 })
    expect((await televerserPhoto('p', PHOTO, t)).issue).toBe('reporte')
    expect(appels.some((a) => a.url.includes('/photos/ph'))).toBe(false)
  })

  it('un releve introuvable est un refus definitif', async () => {
    const { t } = transport({ prep: 409 })
    expect(await televerserPhoto('p', PHOTO, t)).toEqual({ issue: 'refuse', message: 'Refusé.' })
  })

  it('une coupure reseau est reportee', async () => {
    const t = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    expect((await televerserPhoto('p', PHOTO, t)).issue).toBe('reporte')
  })
})
