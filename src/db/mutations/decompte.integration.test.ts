/**
 * Circuit des decomptes sur la base d'integration. Le jeu de demonstration
 * porte cinq decomptes acceptes et celui d'aout presente ; ce dernier est
 * remis dans cet etat a la fin.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { presenterDecompte, statuerDecompte } from '@/db/mutations/decompte'
import { RefusMetier } from '@/db/mutations/erreurs'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerSituations } from '@/db/queries/situation'
import { recompute } from '@/db/recompute'

const { db, client, fermer } = dbScript()
let projetId: string
let conducteurId: string
let moeId: string

beforeAll(async () => {
  projetId = await premierProjetId(db)
  await recompute(db, projetId)
  const [c] = await client<{ id: string }[]>`select id from utilisateur where role = 'CONDUCTEUR'`
  const [m] = await client<{ id: string }[]>`select id from utilisateur where role = 'MOE'`
  conducteurId = c?.id as string
  moeId = m?.id as string
})

afterAll(async () => {
  // Retour a l'etat du jeu : aout presente, non accepte.
  await client.begin(async (tx) => {
    await tx`alter table decompte disable trigger gel_decompte`
    await tx`delete from decompte where projet_id = ${projetId}::uuid and mois >= '2026-08-01'`
    await tx`alter table decompte enable trigger gel_decompte`
  })
  await presenterDecompte(db, projetId, '2026-08', '2026-09-05', conducteurId)
  await fermer()
})

describe('circuit des decomptes', () => {
  it('un decompte rejete se presente a nouveau, puis s accepte', async () => {
    await statuerDecompte(db, projetId, '2026-08', 'REJETEE', '2026-09-10', moeId)
    const avant = await chargerSituations(db, projetId, '2026-10-20')
    expect(avant.moisPresentable).toBe('2026-08')
    await presenterDecompte(db, projetId, '2026-08', '2026-09-12', conducteurId)
    await statuerDecompte(db, projetId, '2026-08', 'ACCEPTEE', '2026-09-15', moeId)
    const apres = await chargerSituations(db, projetId, '2026-10-20')
    expect(apres.situations.find((s) => s.mois === '2026-08')?.statut).toBe('ACCEPTEE')
  })

  it('la base refuse de modifier un decompte accepte', async () => {
    await expect(
      client`update decompte set a_payer_xof = 1
              where projet_id = ${projetId}::uuid and mois = '2026-03-01'`,
    ).rejects.toMatchObject({ code: 'CS001' })
  })

  it('un mois en cours ne se presente pas, un mois deja presente non plus', async () => {
    const d = await chargerSituations(db, projetId, '2026-10-20')
    const enCours = d.situations.at(-1)
    expect(enCours?.provisoire).toBe(true)
    await expect(
      presenterDecompte(db, projetId, enCours?.mois as string, '2026-10-20', conducteurId),
    ).rejects.toBeInstanceOf(RefusMetier)
    await expect(
      presenterDecompte(db, projetId, '2026-03', '2026-10-01', conducteurId),
    ).rejects.toBeInstanceOf(RefusMetier)
  })

  it('un paiement fige reste fige quand le journal change', async () => {
    const d = await chargerSituations(db, projetId, '2026-10-20')
    const mars = d.situations.find((s) => s.mois === '2026-03')
    const [fige] = await client<{ a: string }[]>`
      select a_payer_xof::text as a from decompte
       where projet_id = ${projetId}::uuid and mois = '2026-03-01'`
    expect(mars?.aPayerXof).toBe(Number(fige?.a))
  })
})
