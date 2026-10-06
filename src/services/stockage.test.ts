import { describe, expect, it } from 'vitest'
import {
  cheminPhoto,
  cheminPlan,
  cheminValide,
  fichierLocal,
  piloteLocal,
  piloteSupabase,
  signatureValide,
  signer,
  tailleMaxDepot,
} from '@/services/stockage'

const SECRET = 's'.repeat(32)

describe('chemins du magasin', () => {
  it('compose le chemin d une photo et de sa vignette', () => {
    expect(cheminPhoto('p1', 'f1', 'image')).toBe('projets/p1/photos/f1.webp')
    expect(cheminPhoto('p1', 'f1', 'vignette')).toBe('projets/p1/photos/f1-vignette.webp')
  })

  it('compose le chemin d un plan, et lui accorde une taille de depot plus grande', () => {
    expect(cheminPlan('p1', 'n1')).toBe('projets/p1/plans/n1.webp')
    expect(tailleMaxDepot(cheminPlan('p1', 'n1'))).toBe(16 * 1024 * 1024)
    expect(tailleMaxDepot(cheminPhoto('p1', 'f1', 'image'))).toBe(3 * 1024 * 1024)
    expect(tailleMaxDepot('projets/p1/photos/plans/x.webp')).toBe(3 * 1024 * 1024)
  })

  it('refuse toute remontee de repertoire et tout chemin absolu', () => {
    for (const c of ['../etc/passwd', 'a/../../b', '/racine', 'a//b', 'a/', '', 'a b']) {
      expect(cheminValide(c), c).toBe(false)
    }
    expect(cheminValide('projets/p1/photos/f1.webp')).toBe(true)
  })

  it('confine le fichier local a la racine du magasin', () => {
    expect(() => fichierLocal('../hors.webp')).toThrow()
    expect(fichierLocal('projets/p1/a.webp')).toMatch(/\.stockage[/\\]projets[/\\]p1[/\\]a\.webp$/)
  })
})

describe('signature des URL locales', () => {
  const futur = Math.floor(Date.now() / 1000) + 600

  it('accepte une signature juste et non echue', () => {
    const sig = signer(SECRET, 'depot', 'projets/p/a.webp', futur)
    expect(signatureValide(SECRET, 'depot', 'projets/p/a.webp', futur, sig)).toBe(true)
  })

  it('refuse une signature echue', () => {
    const passe = Math.floor(Date.now() / 1000) - 1
    const sig = signer(SECRET, 'depot', 'projets/p/a.webp', passe)
    expect(signatureValide(SECRET, 'depot', 'projets/p/a.webp', passe, sig)).toBe(false)
  })

  it('refuse une signature detournee vers un autre fichier', () => {
    const sig = signer(SECRET, 'depot', 'projets/p/a.webp', futur)
    expect(signatureValide(SECRET, 'depot', 'projets/p/b.webp', futur, sig)).toBe(false)
  })

  it('une signature de lecture ne vaut pas pour un depot', () => {
    const sig = signer(SECRET, 'lecture', 'projets/p/a.webp', futur)
    expect(signatureValide(SECRET, 'depot', 'projets/p/a.webp', futur, sig)).toBe(false)
  })

  it('refuse une echeance prolongee a la main', () => {
    const sig = signer(SECRET, 'lecture', 'projets/p/a.webp', futur)
    expect(signatureValide(SECRET, 'lecture', 'projets/p/a.webp', futur + 3600, sig)).toBe(false)
  })

  it('refuse une signature tronquee sans lever d erreur', () => {
    expect(signatureValide(SECRET, 'lecture', 'projets/p/a.webp', futur, 'abc')).toBe(false)
  })

  it('le pilote local produit des URL que la verification accepte', async () => {
    const url = new URL(await piloteLocal(SECRET).urlLecture('projets/p/a.webp'), 'http://x')
    expect(url.pathname).toBe('/api/stockage/fichier')
    const ok = signatureValide(
      SECRET,
      'lecture',
      url.searchParams.get('chemin') as string,
      Number(url.searchParams.get('exp')),
      url.searchParams.get('sig') as string,
    )
    expect(ok).toBe(true)
  })
})

describe('pilote Supabase', () => {
  function transport(reponses: Record<string, unknown>) {
    const appels: { url: string; init: RequestInit | undefined }[] = []
    const t = (async (url: string, init?: RequestInit) => {
      appels.push({ url, init })
      const cle = Object.keys(reponses).find((k) => url.includes(k))
      return cle
        ? new Response(JSON.stringify(reponses[cle]), { status: 200 })
        : new Response('{}', { status: 404 })
    }) as typeof fetch
    return { t, appels }
  }

  it('demande une URL de depot signee avec la cle de service', async () => {
    const { t, appels } = transport({
      '/object/upload/sign/': { url: '/object/upload/sign/photos/projets/p/a.webp?token=jeton' },
    })
    const s = piloteSupabase('https://x.supabase.co/', 'cle', 'photos', t)
    const d = await s.urlDepot('projets/p/a.webp', 'image/webp')
    expect(d.url).toBe(
      'https://x.supabase.co/storage/v1/object/upload/sign/photos/projets/p/a.webp?token=jeton',
    )
    expect(appels[0]?.url).toBe(
      'https://x.supabase.co/storage/v1/object/upload/sign/photos/projets/p/a.webp',
    )
    expect((appels[0]?.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer cle')
  })

  it('signe une URL de lecture d une heure', async () => {
    const { t, appels } = transport({
      '/object/sign/': { signedURL: '/object/sign/photos/a?token=t' },
    })
    const url = await piloteSupabase('https://x.supabase.co', 'cle', 'photos', t).urlLecture('a')
    expect(url).toBe('https://x.supabase.co/storage/v1/object/sign/photos/a?token=t')
    expect(JSON.parse(String(appels[0]?.init?.body))).toEqual({ expiresIn: 3600 })
  })

  it('lit un fichier par le serveur, avec la cle de service', async () => {
    const { t, appels } = transport({ '/object/authenticated/': { ok: 1 } })
    const octets = await piloteSupabase('https://x.supabase.co', 'cle', 'photos', t).lire(
      'p/a.webp',
    )
    expect(new TextDecoder().decode(octets ?? new Uint8Array())).toBe('{"ok":1}')
    expect(appels[0]?.url).toBe(
      'https://x.supabase.co/storage/v1/object/authenticated/photos/p/a.webp',
    )
  })

  it('un fichier absent se lit nul', async () => {
    const { t } = transport({})
    expect(await piloteSupabase('https://x.supabase.co', 'cle', 'photos', t).lire('a')).toBeNull()
  })

  it('un fichier absent a une taille nulle', async () => {
    const { t } = transport({})
    expect(await piloteSupabase('https://x.supabase.co', 'cle', 'photos', t).taille('a')).toBeNull()
  })
})

describe('lecture serveur des planches publiques', () => {
  it('lit une planche du dossier public et refuse d en sortir', async () => {
    const { lireFichier } = await import('@/services/stockage')
    expect(await lireFichier('/uploads/demo/pdv1-2026-03-29.svg')).not.toBeNull()
    expect(await lireFichier('/../package.json')).toBeNull()
    expect(await lireFichier('/uploads/absente.svg')).toBeNull()
  })
})
