import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { IssueEnvoi } from '@/lib/hors-ligne/envoi'
import { lister, mettreEnFile, retirer, synchroniser, viderPourTest } from '@/lib/hors-ligne/file'
import type { ReleveSaisi } from '@/lib/releve'
import type { IssuePhoto, PhotoAEnvoyer } from '@/lib/photos/televersement'
import { listerPhotos, mettrePhotoEnFile, synchroniserPhotos } from '@/lib/hors-ligne/file'

const P = 'projet-1'
const CHEF = 'chef'
const AUTRE = 'autre-chef'

function releve(id: string, date = '2026-10-01'): ReleveSaisi {
  return { id, date } as ReleveSaisi
}

/** Serveur simule : une issue par identifiant, enregistre par defaut. */
function serveur(issues: Record<string, IssueEnvoi> = {}) {
  const recus: string[] = []
  const envoyer = async (_p: string, r: ReleveSaisi): Promise<IssueEnvoi> => {
    recus.push(r.id)
    return issues[r.id] ?? { issue: 'enregistre', releveId: r.id, statut: 'SOUMIS', cree: true }
  }
  return { envoyer, recus }
}

const RESEAU: IssueEnvoi = { issue: 'reporte', cause: 'reseau', message: 'Pas de réseau.' }

beforeEach(async () => {
  await viderPourTest()
})

describe('mise en file', () => {
  it('conserve un releve saisi sans reseau', async () => {
    await mettreEnFile(P, CHEF, releve('a'))
    const file = await lister(P, CHEF)
    expect(file).toHaveLength(1)
    expect(file[0]).toMatchObject({ id: 'a', etat: 'en_attente', tentatives: 0 })
  })

  it('remettre en file le meme releve remplace l entree au lieu de la doubler', async () => {
    await mettreEnFile(P, CHEF, releve('a'), null, 1000)
    await mettreEnFile(P, CHEF, { ...releve('a'), soumettre: true }, null, 5000)
    const file = await lister(P, CHEF)
    expect(file).toHaveLength(1)
    expect(file[0]?.releve.soumettre).toBe(true)
    // L'anciennete est celle de la premiere mise en file.
    expect(file[0]?.misEnFileLe).toBe(1000)
  })

  it('cloisonne la file par utilisateur et par projet', async () => {
    await mettreEnFile(P, CHEF, releve('a'))
    await mettreEnFile(P, AUTRE, releve('b'))
    await mettreEnFile('projet-2', CHEF, releve('c'))
    expect((await lister(P, CHEF)).map((e) => e.id)).toEqual(['a'])
  })

  it('restitue la file dans l ordre de saisie', async () => {
    await mettreEnFile(P, CHEF, releve('tard'), null, 3000)
    await mettreEnFile(P, CHEF, releve('tot'), null, 1000)
    expect((await lister(P, CHEF)).map((e) => e.id)).toEqual(['tot', 'tard'])
  })

  it('retire une entree a la demande', async () => {
    await mettreEnFile(P, CHEF, releve('a'))
    await retirer('a')
    expect(await lister(P, CHEF)).toEqual([])
  })
})

describe('synchronisation', () => {
  it('deux saisies en file arrivent toutes deux, dans l ordre, et quittent la file', async () => {
    await mettreEnFile(P, CHEF, releve('lundi'), null, 1000)
    await mettreEnFile(P, CHEF, releve('mardi'), null, 2000)
    const s = serveur()
    const bilan = await synchroniser(P, CHEF, s.envoyer)
    expect(s.recus).toEqual(['lundi', 'mardi'])
    expect(bilan).toEqual({ envoyes: 2, refuses: 0, restants: 0, interrompue: false })
    expect(await lister(P, CHEF)).toEqual([])
  })

  it('n envoie jamais la file d un autre utilisateur', async () => {
    await mettreEnFile(P, AUTRE, releve('pas-le-mien'))
    const s = serveur()
    await synchroniser(P, CHEF, s.envoyer)
    expect(s.recus).toEqual([])
    expect(await lister(P, AUTRE)).toHaveLength(1)
  })

  it('un refus est garde avec son motif, et n est plus renvoye', async () => {
    await mettreEnFile(P, CHEF, releve('conflit'))
    const s = serveur({ conflit: { issue: 'refuse', message: 'Existe déjà.' } })
    const bilan = await synchroniser(P, CHEF, s.envoyer)
    expect(bilan.refuses).toBe(1)
    const [e] = await lister(P, CHEF)
    expect(e).toMatchObject({ etat: 'refuse', motif: 'Existe déjà.', tentatives: 1 })

    await synchroniser(P, CHEF, s.envoyer)
    expect(s.recus).toEqual(['conflit'])
  })

  it('une coupure interrompt la synchronisation et garde tout ce qui reste', async () => {
    await mettreEnFile(P, CHEF, releve('a'), null, 1000)
    await mettreEnFile(P, CHEF, releve('b'), null, 2000)
    await mettreEnFile(P, CHEF, releve('c'), null, 3000)
    const s = serveur({ b: RESEAU })
    const bilan = await synchroniser(P, CHEF, s.envoyer)

    expect(s.recus).toEqual(['a', 'b'])
    expect(bilan).toEqual({ envoyes: 1, refuses: 0, restants: 2, interrompue: true })
    const file = await lister(P, CHEF)
    expect(file.map((e) => e.id)).toEqual(['b', 'c'])
    expect(file[0]).toMatchObject({ etat: 'en_attente', tentatives: 1, motif: 'Pas de réseau.' })
  })

  it('au retour du reseau, ce qui restait part', async () => {
    await mettreEnFile(P, CHEF, releve('a'), null, 1000)
    await mettreEnFile(P, CHEF, releve('b'), null, 2000)
    await synchroniser(P, CHEF, serveur({ a: RESEAU }).envoyer)
    expect(await lister(P, CHEF)).toHaveLength(2)

    const bilan = await synchroniser(P, CHEF, serveur().envoyer)
    expect(bilan.envoyes).toBe(2)
    expect(await lister(P, CHEF)).toEqual([])
  })

  it('une session expiree interrompt aussi, sans rien perdre', async () => {
    await mettreEnFile(P, CHEF, releve('a'))
    const bilan = await synchroniser(
      P,
      CHEF,
      serveur({ a: { issue: 'reporte', cause: 'session', message: 'Expirée.' } }).envoyer,
    )
    expect(bilan.interrompue).toBe(true)
    expect(await lister(P, CHEF)).toHaveLength(1)
  })
})

describe('photos en file', () => {
  const photo = (id: string, releveId: string) =>
    ({ id, releveId, image: new Blob(['i']), vignette: new Blob(['v']) }) as PhotoAEnvoyer

  function serveurPhotos(issues: Record<string, IssuePhoto> = {}) {
    const recus: string[] = []
    const envoyer = async (_p: string, ph: PhotoAEnvoyer): Promise<IssuePhoto> => {
      recus.push(ph.id)
      return issues[ph.id] ?? { issue: 'enregistre' }
    }
    return { envoyer, recus }
  }

  it('une photo attend que son releve soit parti', async () => {
    await mettreEnFile(P, CHEF, releve('r1'))
    await mettrePhotoEnFile(P, CHEF, photo('ph1', 'r1'))
    const s = serveurPhotos()
    await synchroniserPhotos(P, CHEF, s.envoyer)
    expect(s.recus).toEqual([])

    await synchroniser(P, CHEF, serveur().envoyer)
    await synchroniserPhotos(P, CHEF, s.envoyer)
    expect(s.recus).toEqual(['ph1'])
    expect(await listerPhotos(P, CHEF)).toEqual([])
  })

  it('conserve les fichiers de la photo jusqu a son envoi', async () => {
    await mettrePhotoEnFile(P, CHEF, photo('ph2', 'r-deja-envoye'))
    const [p] = await listerPhotos(P, CHEF)
    expect(p?.image).toBeInstanceOf(Blob)
  })

  it('une coupure garde la photo, un refus la marque', async () => {
    await mettrePhotoEnFile(P, CHEF, photo('a', 'r'), 1)
    await mettrePhotoEnFile(P, CHEF, photo('b', 'r'), 2)
    const bilan = await synchroniserPhotos(
      P,
      CHEF,
      serveurPhotos({
        a: { issue: 'refuse', message: 'Relevé introuvable.' },
        b: { issue: 'reporte', cause: 'reseau', message: 'Pas de réseau.' },
      }).envoyer,
    )
    expect(bilan).toEqual({ envoyes: 0, refuses: 1, restants: 1, interrompue: true })
    const [a, b] = await listerPhotos(P, CHEF)
    expect(a).toMatchObject({ etat: 'refuse', motif: 'Relevé introuvable.' })
    expect(b).toMatchObject({ etat: 'en_attente' })
  })
})
