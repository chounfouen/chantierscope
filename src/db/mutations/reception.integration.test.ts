/**
 * Reserves et reception, sur la base d'integration. La reception prononcee
 * est defaite apres chaque cas : les autres suites lisent un chantier en
 * cours.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import { constaterReserve, leverReserve, prononcerReception } from '@/db/mutations/reception'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerReception, reservesOuvertesParZone } from '@/db/queries/reception'

const { db, client, fermer } = dbScript()
let projetId: string
let moeId: string
let zoneId: string

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const [m] = await client<{ id: string }[]>`select id from utilisateur where role = 'MOE'`
  moeId = m?.id as string
  const [z] = await client<{ id: string }[]>`
    select id from zone where projet_id = ${projetId}::uuid and niveau = 2 limit 1`
  zoneId = z?.id as string
})

afterEach(async () => {
  await client`delete from reserve where description like 'Essai %'`
  await client`update projet set date_reception = null where id = ${projetId}::uuid`
})

afterAll(async () => {
  await fermer()
})

const reserve = (phase: 'OPR' | 'PARFAIT_ACHEVEMENT' = 'OPR', constateeLe = '2026-09-25') => ({
  phase,
  zoneId,
  lotId: null,
  description: 'Essai : joint de carrelage manquant',
  constateeLe,
  echeance: '2026-10-10',
})

describe('reserves', () => {
  it('une reserve se localise sur le plan, puis se leve', async () => {
    const avant = await reservesOuvertesParZone(db, projetId)
    await constaterReserve(db, projetId, reserve(), moeId)
    const pendant = await reservesOuvertesParZone(db, projetId)
    expect(pendant[zoneId]).toBe((avant[zoneId] ?? 0) + 1)

    const [r] = await client<{ id: string }[]>`
      select id from reserve where description like 'Essai %'`
    await expect(
      leverReserve(db, projetId, r?.id as string, '2026-09-20', moeId),
    ).rejects.toBeInstanceOf(RefusMetier)
    await leverReserve(db, projetId, r?.id as string, '2026-10-01', moeId)
    const apres = await reservesOuvertesParZone(db, projetId)
    expect(apres[zoneId] ?? 0).toBe(avant[zoneId] ?? 0)
  })

  it('une reserve de parfait achevement suit la reception', async () => {
    await expect(
      constaterReserve(db, projetId, reserve('PARFAIT_ACHEVEMENT'), moeId),
    ).rejects.toBeInstanceOf(RefusMetier)
    await prononcerReception(db, projetId, '2026-10-01', moeId)
    await constaterReserve(db, projetId, reserve('PARFAIT_ACHEVEMENT', '2026-10-05'), moeId)
    const r = await chargerReception(db, projetId, '2026-10-20')
    expect(r.dateReception).toBe('2026-10-01')
    expect(r.finGarantie).toBe('2027-10-01')
  })

  it('la reception ne se prononce qu une fois', async () => {
    await prononcerReception(db, projetId, '2026-10-01', moeId)
    await expect(prononcerReception(db, projetId, '2026-10-02', moeId)).rejects.toBeInstanceOf(
      RefusMetier,
    )
  })

  it('le jeu de demonstration porte la visite de pre-reception du RDC', async () => {
    const r = await chargerReception(db, projetId, '2026-10-20')
    expect(r.synthese.total).toBe(6)
    expect(r.synthese.levees).toBe(2)
    expect(r.synthese.enRetard).toBe(4)
  })
})
