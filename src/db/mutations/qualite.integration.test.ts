/**
 * Qualite sur la base d'integration : essais du beton, fiche ouverte sur un
 * resultat non conforme, cycle de traitement et de levee.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import {
  enregistrerEssais,
  leverNonConformite,
  ouvrirNonConformite,
  traiterNonConformite,
} from '@/db/mutations/qualite'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerQualite } from '@/db/queries/qualite'

const { db, client, fermer } = dbScript()
let projetId: string
let conducteurId: string
let coulage: { id: string; date: string }
let coulageBrouillon: string

const plus = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const [c] = await client<{ id: string }[]>`select id from utilisateur where role = 'CONDUCTEUR'`
  conducteurId = c?.id as string
  // Un coulage valide sans aucun essai : les plus recents.
  const [v] = await client<{ id: string; date: string }[]>`
    select c.id, r.date::text as date from releve_coulage c
      join releve_journalier r on r.id = c.releve_journalier_id
     where r.statut = 'VALIDE' and c.classe_beton = 'C30/37'
       and not exists (select 1 from essai_beton e where e.coulage_id = c.id)
     order by r.date desc limit 1`
  coulage = v as { id: string; date: string }
  const [b] = await client<{ id: string }[]>`
    select c.id from releve_coulage c join releve_journalier r on r.id = c.releve_journalier_id
     where r.statut <> 'VALIDE' limit 1`
  coulageBrouillon = b?.id as string
})

afterEach(async () => {
  await client`delete from non_conformite where coulage_id = ${coulage.id}::uuid
                 or titre like 'Essai %'`
  await client`delete from essai_beton where coulage_id = ${coulage.id}::uuid`
})

afterAll(async () => {
  await fermer()
})

const essais = (ageJ: number, resistancesMpa: number[], prelevement = 1) => ({
  prelevement,
  ageJ,
  dateEcrasement: plus(coulage.date, ageJ),
  resistancesMpa,
  laboratoire: null,
})

describe('essais du beton', () => {
  it('un resultat conforme a 28 jours n ouvre rien', async () => {
    const r = await enregistrerEssais(
      db,
      projetId,
      coulage.id,
      essais(28, [36.2, 35.8, 37]),
      conducteurId,
    )
    expect(r.conformite.etat).toBe('CONFORME')
    expect(r.ficheOuverte).toBeNull()
  })

  it('un resultat sous fck - 4 ouvre une fiche, une seule', async () => {
    const r = await enregistrerEssais(
      db,
      projetId,
      coulage.id,
      essais(28, [24.8, 23.6, 24.5]),
      conducteurId,
    )
    expect(r.conformite.etat).toBe('NON_CONFORME')
    expect(r.ficheOuverte).not.toBeNull()
    const second = await enregistrerEssais(
      db,
      projetId,
      coulage.id,
      essais(28, [24, 24.2, 23.9], 2),
      conducteurId,
    )
    expect(second.ficheOuverte).toBeNull()
    const q = await chargerQualite(db, projetId, plus(coulage.date, 30), true)
    expect(q.fiches.filter((f) => f.coulageId === coulage.id)).toHaveLength(1)
  })

  it('refuse un doublon, une date incoherente, un releve non valide', async () => {
    await enregistrerEssais(db, projetId, coulage.id, essais(7, [25, 26, 25.5]), conducteurId)
    await expect(
      enregistrerEssais(db, projetId, coulage.id, essais(7, [25, 26, 25.5]), conducteurId),
    ).rejects.toThrow(/déjà ses résultats/)
    await expect(
      enregistrerEssais(
        db,
        projetId,
        coulage.id,
        { ...essais(28, [30]), dateEcrasement: plus(coulage.date, 10) },
        conducteurId,
      ),
    ).rejects.toBeInstanceOf(RefusMetier)
    if (coulageBrouillon) {
      await expect(
        enregistrerEssais(db, projetId, coulageBrouillon, essais(7, [20]), conducteurId),
      ).rejects.toThrow(/relevé validé/)
    }
  })
})

describe('cycle d une fiche de non-conformite', () => {
  it('ouverte, traitee, puis levee, dans cet ordre', async () => {
    const { numero } = await ouvrirNonConformite(
      db,
      projetId,
      {
        dateConstat: '2026-09-20',
        lotId: null,
        titre: 'Essai de fiche',
        constat: 'Constat de test sur un ouvrage fictif.',
        gravite: 2,
      },
      conducteurId,
    )
    const [f] = await client<{ id: string }[]>`
      select id from non_conformite where projet_id = ${projetId}::uuid and numero = ${numero}`
    const id = f?.id as string
    await expect(
      leverNonConformite(db, projetId, id, '2026-09-25', conducteurId),
    ).rejects.toBeInstanceOf(RefusMetier)
    await expect(
      traiterNonConformite(
        db,
        projetId,
        id,
        { cause: 'Cause du test', action: 'Action du test', date: '2026-09-19' },
        conducteurId,
      ),
    ).rejects.toBeInstanceOf(RefusMetier)
    await traiterNonConformite(
      db,
      projetId,
      id,
      { cause: 'Cause du test', action: 'Action du test', date: '2026-09-22' },
      conducteurId,
    )
    await leverNonConformite(db, projetId, id, '2026-09-25', conducteurId)
    const [lue] = await client<{ statut: string }[]>`
      select statut::text as statut from non_conformite where id = ${id}::uuid`
    expect(lue?.statut).toBe('LEVEE')
  })

  it('le maitre d ouvrage ne voit pas le cout des reprises', async () => {
    const q = await chargerQualite(db, projetId, '2026-09-27', false)
    expect(q.fiches.length).toBeGreaterThan(0)
    for (const f of q.fiches) expect(f.coutXof).toBeNull()
  })

  it('le jeu de demonstration porte une non-conformite du beton, levee', async () => {
    const q = await chargerQualite(db, projetId, '2026-09-27', true)
    expect(q.synthese.nonConformes).toBe(1)
    expect(q.synthese.pointsArretFranchis).toBe(2)
    const beton = q.fiches.find((f) => f.coulageId !== null)
    expect(beton?.statut).toBe('LEVEE')
  })
})
