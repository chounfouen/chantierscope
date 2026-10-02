import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { completerMeteoProjet } from '@/db/mutations/meteo'
import { premierProjetId } from '@/db/queries/contexte'
import type { JourMeteo } from '@/services/meteo'

const { db, client, fermer } = dbScript()
let projetId: string

/** Prepare un releve sans meteo, hors declencheur de gel. */
async function sansMeteo(statut: string, corrigee = false): Promise<{ id: string; date: string }> {
  const [r] = await client<{ id: string; date: string }[]>`
    select id, to_char(date, 'YYYY-MM-DD') as date from releve_journalier
     where statut = ${statut}::statut_releve and precipitations_mm is not null
     order by date limit 1`
  await client.begin(async (tx) => {
    await tx`alter table releve_journalier disable trigger gel_releve_journalier`
    await tx`update releve_journalier set meteo_code = null, temperature_c = null,
               precipitations_mm = null, rafales_kmh = null, meteo_corrigee = ${corrigee}
             where id = ${r?.id as string}::uuid`
    await tx`alter table releve_journalier enable trigger gel_releve_journalier`
  })
  return r as { id: string; date: string }
}

function journee(date: string): Map<string, JourMeteo> {
  return new Map([
    [
      date,
      {
        date,
        code: 61,
        temperatureMaxC: 29.5,
        temperatureMinC: 24,
        precipitationsMm: 8.4,
        rafalesKmh: 31,
      },
    ],
  ])
}

beforeAll(async () => {
  projetId = await premierProjetId(db)
})

afterAll(async () => {
  await fermer()
})

describe('completion nocturne de la meteo', () => {
  it('compte reellement les releves completes', async () => {
    const r = await sansMeteo('VALIDE')
    expect(await completerMeteoProjet(db, projetId, journee(r.date))).toBeGreaterThanOrEqual(1)
    const [apres] = await client<{ p: string }[]>`
      select precipitations_mm::text as p from releve_journalier where id = ${r.id}::uuid`
    expect(Number(apres?.p)).toBe(8.4)
  })

  it('un second passage ne complete plus rien', async () => {
    const [r] = await client<{ date: string }[]>`
      select to_char(date, 'YYYY-MM-DD') as date from releve_journalier
       where precipitations_mm = 8.4 limit 1`
    expect(await completerMeteoProjet(db, projetId, journee(r?.date as string))).toBe(0)
  })

  it('respecte une meteo corrigee sur le terrain, meme vide', async () => {
    const r = await sansMeteo('SOUMIS', true)
    // Les autres releves de cette journee sont deja renseignes : rien ne
    // doit etre complete.
    expect(await completerMeteoProjet(db, projetId, journee(r.date))).toBe(0)
  })
})
