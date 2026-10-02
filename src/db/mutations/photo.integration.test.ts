import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { enregistrerPhoto, type PhotoAEnregistrer } from '@/db/mutations/photo'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerReleve } from '@/db/queries/saisie'

const { db, client, fermer } = dbScript()
let projetId: string
let chefId: string
let releveValideId: string

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const [c] = await client<
    { id: string }[]
  >`select id from utilisateur where role = 'CHEF_CHANTIER'`
  chefId = c?.id as string
  const [r] = await client<{ id: string }[]>`
    select id from releve_journalier where statut = 'VALIDE' order by date desc limit 1`
  releveValideId = r?.id as string
})

afterAll(async () => {
  await fermer()
})

function photo(modifs: Partial<PhotoAEnregistrer> = {}): PhotoAEnregistrer {
  const id = randomUUID()
  return {
    id,
    releveId: releveValideId,
    chemin: `projets/${projetId}/photos/${id}.webp`,
    cheminVignette: `projets/${projetId}/photos/${id}-vignette.webp`,
    largeur: 1600,
    hauteur: 1200,
    octets: 118_000,
    priseLe: '2026-09-30T10:15:00Z',
    legende: 'Ferraillage dalle haute',
    ...modifs,
  }
}

describe('enregistrement d une photo', () => {
  it('rattache la photo a un releve, meme gele : elle documente sans engager', async () => {
    const p = photo()
    expect(await enregistrerPhoto(db, projetId, p, chefId)).toEqual({ creee: true })
    const detail = await chargerReleve(db, releveValideId)
    expect(detail?.photos.map((x) => x.id)).toContain(p.id)
  })

  it('un renvoi de la meme photo ne la duplique pas', async () => {
    const p = photo()
    await enregistrerPhoto(db, projetId, p, chefId)
    expect(await enregistrerPhoto(db, projetId, p, chefId)).toEqual({ creee: false })
    const [n] = await client<
      { n: number }[]
    >`select count(*)::int as n from photo where id = ${p.id}::uuid`
    expect(n?.n).toBe(1)
  })

  it('refuse une photo dont le releve n appartient pas au projet', async () => {
    await expect(enregistrerPhoto(db, randomUUID(), photo(), chefId)).rejects.toBeInstanceOf(
      RefusMetier,
    )
    await expect(
      enregistrerPhoto(db, projetId, photo({ releveId: randomUUID() }), chefId),
    ).rejects.toBeInstanceOf(RefusMetier)
  })
})
