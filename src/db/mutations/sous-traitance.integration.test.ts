/**
 * Sous-traitance et registre de securite, sur la base d'integration. Chaque
 * cas efface ce qu'il cree : les autres suites lisent le jeu de demonstration.
 */

import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import {
  consignerEvenement,
  demanderAgrement,
  statuerAgrement,
} from '@/db/mutations/sous-traitance'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerSecurite, chargerSousTraitants } from '@/db/queries/securite'

const { db, client, fermer } = dbScript()
let projetId: string
let conducteurId: string
let lotLibre: string
let lotPris: string

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const [c] = await client<{ id: string }[]>`select id from utilisateur where role = 'CONDUCTEUR'`
  conducteurId = c?.id as string
  const [libre] = await client<{ id: string }[]>`
    select id from lot where code = '06' and projet_id = ${projetId}::uuid`
  const [pris] = await client<{ id: string }[]>`
    select id from lot where code = '07' and projet_id = ${projetId}::uuid`
  lotLibre = libre?.id as string
  lotPris = pris?.id as string
})

afterEach(async () => {
  await client`delete from sous_traitant where raison_sociale like 'Essai %'`
  await client`delete from evenement_securite where description like 'Essai %'`
})

afterAll(async () => {
  await fermer()
})

const demande = (lotIds: string[], nom = 'Essai Plâtrerie') => ({
  raisonSociale: nom,
  specialite: 'Plâtrerie et cloisons',
  montantXof: 30_000_000,
  paiementDirect: true,
  demandeLe: '2026-09-01',
  lotIds,
})

describe('agrement des sous-traitants', () => {
  it('declare, puis agree, un sous-traitant sur un lot libre', async () => {
    const { id } = await demanderAgrement(db, projetId, demande([lotLibre]), conducteurId)
    await statuerAgrement(db, projetId, id, 'AGREE', '2026-09-10', conducteurId)
    const { sousTraitants } = await chargerSousTraitants(db, projetId, true)
    const st = sousTraitants.find((s) => s.id === id)
    expect(st?.statut).toBe('AGREE')
    expect(st?.lots.map((l) => l.id)).toEqual([lotLibre])
  })

  it('refuse un lot deja confie, et un lot d un autre projet', async () => {
    await expect(demanderAgrement(db, projetId, demande([lotPris]), conducteurId)).rejects.toThrow(
      /déjà confié/,
    )
    await expect(
      demanderAgrement(db, projetId, demande([randomUUID()]), conducteurId),
    ).rejects.toBeInstanceOf(RefusMetier)
  })

  it('refuse une decision anterieure a la demande, ou une seconde decision', async () => {
    const { id } = await demanderAgrement(db, projetId, demande([lotLibre]), conducteurId)
    await expect(
      statuerAgrement(db, projetId, id, 'AGREE', '2026-08-01', conducteurId),
    ).rejects.toBeInstanceOf(RefusMetier)
    await statuerAgrement(db, projetId, id, 'REFUSE', '2026-09-02', conducteurId)
    await expect(
      statuerAgrement(db, projetId, id, 'AGREE', '2026-09-03', conducteurId),
    ).rejects.toBeInstanceOf(RefusMetier)
  })

  it('un lot repris a un sous-traitant refuse peut etre confie a un autre', async () => {
    const { id } = await demanderAgrement(db, projetId, demande([lotLibre]), conducteurId)
    await statuerAgrement(db, projetId, id, 'REFUSE', '2026-09-02', conducteurId)
    const second = await demanderAgrement(
      db,
      projetId,
      demande([lotLibre], 'Essai Second'),
      conducteurId,
    )
    expect(second.id).toBeDefined()
  })

  it('le maitre d ouvrage ne recoit ni presence ni effectif', async () => {
    const { sousTraitants } = await chargerSousTraitants(db, projetId, false)
    expect(sousTraitants.length).toBeGreaterThan(0)
    for (const s of sousTraitants) {
      expect(s.hommesJours).toBeNull()
      expect(s.presencesSansAgrement).toBeNull()
    }
  })
})

describe('registre de securite', () => {
  it('un accident avec arret entre dans les taux, et remet le compteur a zero', async () => {
    const avant = await chargerSecurite(db, projetId, '2026-09-27', true)
    await consignerEvenement(
      db,
      projetId,
      {
        date: '2026-09-25',
        type: 'ACCIDENT_AVEC_ARRET',
        lotId: lotPris,
        sousTraitantId: null,
        description: 'Essai : chute de plain-pied',
        joursArret: 3,
        participants: null,
      },
      conducteurId,
    )
    const apres = await chargerSecurite(db, projetId, '2026-09-27', true)
    expect(apres.indicateurs.accidentsAvecArret).toBe(avant.indicateurs.accidentsAvecArret + 1)
    expect(apres.indicateurs.joursArret).toBe(avant.indicateurs.joursArret + 3)
    expect(apres.indicateurs.joursSansAccident).toBe(2)
  })

  it('refuse des jours d arret sur autre chose qu un accident avec arret', async () => {
    await expect(
      consignerEvenement(
        db,
        projetId,
        {
          date: '2026-09-25',
          type: 'PRESQU_ACCIDENT',
          lotId: null,
          sousTraitantId: null,
          description: 'Essai : chute d objet',
          joursArret: 2,
          participants: null,
        },
        conducteurId,
      ),
    ).rejects.toBeInstanceOf(RefusMetier)
  })

  it('le maitre d ouvrage lit les taux, pas les heures', async () => {
    const s = await chargerSecurite(db, projetId, '2026-09-27', false)
    expect(s.indicateurs.heures).toBeNull()
    expect(s.indicateurs.tauxFrequence).not.toBeNull()
  })
})
