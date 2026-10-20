/**
 * Tests d'integration du cadre contractuel, sur la base dediee. Chaque cas
 * efface ce qu'il a cree : les autres suites s'appuient sur le marche initial.
 */

import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import {
  ajouterAvenant,
  ajouterOrdreService,
  proposerIntemperies,
  statuerIntemperie,
} from '@/db/mutations/contrat'
import { RefusMetier } from '@/db/mutations/erreurs'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerContrat } from '@/db/queries/contrat'

const { db, client, fermer } = dbScript()
let projetId: string
let conducteurId: string
let lotId: string

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const [c] = await client<{ id: string }[]>`select id from utilisateur where role = 'CONDUCTEUR'`
  conducteurId = c?.id as string
  const [l] = await client<{ id: string }[]>`select id from lot order by ordre limit 1`
  lotId = l?.id as string
})

afterEach(async () => {
  await client`delete from avenant where projet_id = ${projetId}::uuid`
  await client`delete from ordre_service where projet_id = ${projetId}::uuid and numero > 1`
  await client`delete from alea where description like 'Journée arrêtée pour intempérie, constatée%'`
  // Le releve de test est valide, donc gele : il s'efface hors declencheur.
  await client.begin(async (tx) => {
    await tx`alter table releve_journalier disable trigger gel_releve_journalier`
    await tx`delete from releve_journalier where observations = 'test-contrat'`
    await tx`alter table releve_journalier enable trigger gel_releve_journalier`
  })
  await client`delete from reference_planning where projet_id = ${projetId}::uuid and numero > 1`
  await client`update reference_planning set active = true
                where projet_id = ${projetId}::uuid and numero = 1`
})

afterAll(async () => {
  await fermer()
})

const JOUR = '2026-10-20'

describe('cadre contractuel', () => {
  it('le jeu de demonstration porte un ordre de demarrage et des intemperies reconnues', async () => {
    const c = await chargerContrat(db, projetId, JOUR)
    expect(c.ordres.map((o) => o.type)).toEqual(['DEMARRAGE'])
    expect(c.cadre.intemperies.reconnuesJ).toBe(10)
    expect(c.cadre.intemperies.previsiblesJ).toBe(6)
    expect(c.cadre.prolongations.intemperiesJ).toBe(4)
    expect(c.cadre.dureeJ).toBe(416)
  })

  it('un avenant allonge le delai et augmente le montant', async () => {
    const avant = await chargerContrat(db, projetId, JOUR)
    await ajouterAvenant(
      db,
      projetId,
      {
        date: '2026-09-01',
        objet: 'Clôture renforcée',
        montantXof: 25_000_000,
        delaiJ: 10,
        figerReference: false,
      },
      conducteurId,
    )
    const apres = await chargerContrat(db, projetId, JOUR)
    expect(apres.cadre.dureeJ).toBe(avant.cadre.dureeJ + 10)
    expect(apres.cadre.montantXof).toBe(avant.cadre.montantXof + 25_000_000)
  })

  it('un avenant peut figer une nouvelle reference du planning', async () => {
    await ajouterAvenant(
      db,
      projetId,
      {
        date: '2026-09-01',
        objet: 'Travaux modificatifs',
        montantXof: 0,
        delaiJ: 0,
        figerReference: true,
      },
      conducteurId,
    )
    const [r] = await client<{ numero: number; motif: string }[]>`
      select numero, motif from reference_planning where projet_id = ${projetId}::uuid and active`
    expect(r?.numero).toBe(2)
    expect(r?.motif).toMatch(/^Avenant n° 1/)
  })

  it('un arret suivi d une reprise suspend le delai', async () => {
    const avant = await chargerContrat(db, projetId, JOUR)
    await ajouterOrdreService(
      db,
      projetId,
      { date: '2026-08-01', type: 'ARRET', objet: 'Arrêt plans', delaiJ: 0 },
      conducteurId,
    )
    await ajouterOrdreService(
      db,
      projetId,
      { date: '2026-08-11', type: 'REPRISE', objet: 'Reprise', delaiJ: 0 },
      conducteurId,
    )
    const apres = await chargerContrat(db, projetId, JOUR)
    expect(apres.cadre.prolongations.suspensionsJ).toBe(10)
    expect(apres.cadre.dureeJ).toBe(avant.cadre.dureeJ + 10)
  })

  it('refuse une reprise sans arret en cours', async () => {
    await expect(
      ajouterOrdreService(
        db,
        projetId,
        { date: '2026-08-11', type: 'REPRISE', objet: 'Reprise seule', delaiJ: 0 },
        conducteurId,
      ),
    ).rejects.toBeInstanceOf(RefusMetier)
  })
})

describe('intemperies proposees depuis le journal', () => {
  it('une journee arretee par la pluie devient une intemperie a reconnaitre, une seule fois', async () => {
    const [chef] = await client<
      { id: string }[]
    >`select id from utilisateur where role = 'CHEF_CHANTIER'`
    await client`
      insert into releve_journalier (id, projet_id, lot_id, date, statut, journee_travaillee,
                                     motif_arret, precipitations_mm, auteur_id, valide_par_id,
                                     valide_le, observations)
      values (${randomUUID()}::uuid, ${projetId}::uuid, ${lotId}::uuid, '2026-10-12', 'VALIDE',
              false, 'Pluie forte, plus de 25 mm', 41, ${chef?.id as string}::uuid, ${conducteurId}::uuid,
              now(), 'test-contrat')`
    const n = await db.transaction((tx) => proposerIntemperies(tx, projetId))
    expect(n).toBe(1)
    expect(await db.transaction((tx) => proposerIntemperies(tx, projetId))).toBe(0)

    const c = await chargerContrat(db, projetId, JOUR)
    const proposee = c.intemperies.find((i) => i.decision === 'PROPOSEE')
    expect(proposee?.date).toBe('2026-10-12')
    expect(c.cadre.intemperies.proposeesJ).toBe(1)

    await statuerIntemperie(db, projetId, proposee?.id as string, 'RECONNUE', conducteurId)
    const apres = await chargerContrat(db, projetId, JOUR)
    expect(apres.cadre.intemperies.reconnuesJ).toBe(c.cadre.intemperies.reconnuesJ + 1)
    expect(apres.cadre.dureeJ).toBe(c.cadre.dureeJ + 1)
  })
})
