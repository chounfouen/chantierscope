/**
 * Tests d'integration de la saisie journaliere, sur la base dediee.
 *
 * Ils couvrent le circuit complet d'un releve : brouillon, soumission,
 * validation, gel, rectification, et les trois refus metier. Les releves sont
 * crees sur une journee posterieure au jeu de demonstration, pour ne
 * consommer aucun des releves en attente dont les autres suites ont besoin.
 */

import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { RefusMetier } from '@/db/mutations/erreurs'
import {
  enregistrerReleve,
  projetDuReleve,
  rectifierReleve,
  soumettreReleve,
  validerReleve,
  validerReleves,
} from '@/db/mutations/releve'
import { premierProjetId } from '@/db/queries/contexte'
import { recompute } from '@/db/recompute'
import type { ReleveSaisi } from '@/lib/releve'

const { db, client, fermer } = dbScript()

/** Journee sans releve dans le jeu de demonstration. */
const JOUR = '2026-10-01'

let projetId: string
let chefId: string
let conducteurId: string
let lotId: string
let autreLotId: string
let ligneA: string
let ligneB: string
let ligneAutreLot: string

beforeAll(async () => {
  projetId = await premierProjetId(db)
  const comptes = await client<{ id: string; role: string }[]>`
    select id, role::text as role from utilisateur`
  chefId = comptes.find((c) => c.role === 'CHEF_CHANTIER')?.id as string
  conducteurId = comptes.find((c) => c.role === 'CONDUCTEUR')?.id as string

  // Deux lignes d'une meme tache en unites physiques, encore inachevees : une
  // quantite validee y fait donc bouger l'avancement. Le cache est recalcule
  // d'abord, le peuplement de la base de test ne l'alimentant pas.
  await recompute(db, projetId)
  const lignes = await client<{ id: string; lotId: string }[]>`
    select l.id, t.lot_id as "lotId"
      from ligne_quantitatif l
      join tache t on t.id = l.tache_id
     where t.id = (
             select id from tache
              where methode_avancement = 'UNITES_PHYSIQUES' and parent_id is not null
                and date_debut_prevue <= ${JOUR}::date and avancement_pct < 0.9
              order by code_wbs limit 1)
     order by l.quantite_prevue limit 2`
  ligneA = lignes[0]?.id as string
  ligneB = lignes[1]?.id as string
  lotId = lignes[0]?.lotId as string

  const [autre] = await client<{ id: string; lotId: string }[]>`
    select l.id, t.lot_id as "lotId" from ligne_quantitatif l
      join tache t on t.id = l.tache_id
     where t.lot_id <> ${lotId}::uuid limit 1`
  ligneAutreLot = autre?.id as string
  autreLotId = autre?.lotId as string
})

afterAll(async () => {
  await fermer()
})

function saisie(modifs: Partial<ReleveSaisi> = {}): ReleveSaisi {
  return {
    id: randomUUID(),
    soumettre: false,
    date: JOUR,
    lotId,
    meteoCode: 2,
    temperatureC: 30.5,
    precipitationsMm: 0,
    rafalesKmh: 15,
    meteoCorrigee: false,
    journeeTravaillee: true,
    motifArret: null,
    effectifOuvriers: 10,
    effectifEncadrement: 1,
    heuresTravaillees: 80,
    quantites: [{ ligneId: ligneA, quantite: 5, commentaire: null }],
    observations: 'Coulage poteaux niveau 2',
    coulages: [],
    livraisons: [],
    engins: [],
    alea: null,
    ...modifs,
  }
}

async function attendreRefus(p: Promise<unknown>, code: RefusMetier['code']): Promise<string> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(RefusMetier)
    expect((e as RefusMetier).code).toBe(code)
    return (e as RefusMetier).message
  }
  throw new Error(`Refus ${code} attendu, aucun refus obtenu.`)
}

async function relevesDuJour(lot = lotId): Promise<{ id: string; statut: string }[]> {
  return client<{ id: string; statut: string }[]>`
    select id, statut::text as statut from releve_journalier
     where lot_id = ${lot}::uuid and date = ${JOUR}::date order by cree_le`
}

async function quantitesDe(releveId: string): Promise<{ ligne: string; q: number }[]> {
  const lignes = await client<{ ligne: string; q: string }[]>`
    select ligne_quantitatif_id as ligne, quantite_realisee::text as q
      from releve_quantite where releve_journalier_id = ${releveId}::uuid order by ligne`
  return lignes.map((l) => ({ ligne: l.ligne, q: Number(l.q) }))
}

/* -------------------------------------------------------------------------- */

describe('enregistrement d un releve', () => {
  let r: ReleveSaisi

  beforeAll(() => {
    r = saisie()
  })

  it('cree un brouillon avec ses quantites et son auteur', async () => {
    const res = await enregistrerReleve(db, projetId, r, chefId)
    expect(res).toEqual({ releveId: r.id, cree: true, statut: 'BROUILLON' })

    const [ligne] = await client<{ auteur: string; heures: string; obs: string }[]>`
      select auteur_id as auteur, heures_travaillees::text as heures, observations as obs
        from releve_journalier where id = ${r.id}::uuid`
    expect(ligne?.auteur).toBe(chefId)
    expect(Number(ligne?.heures)).toBe(80)
    expect(ligne?.obs).toBe('Coulage poteaux niveau 2')
    expect(await quantitesDe(r.id)).toEqual([{ ligne: ligneA, q: 5 }])
  })

  it('un renvoi identique est reconnu et ne duplique rien', async () => {
    // Cas de la file hors ligne : reponse perdue, releve renvoye.
    const res = await enregistrerReleve(db, projetId, r, chefId)
    expect(res.cree).toBe(false)
    expect(await relevesDuJour()).toHaveLength(1)
    expect(await quantitesDe(r.id)).toHaveLength(1)
  })

  it('une mise a jour remplace les quantites au lieu de les cumuler', async () => {
    await enregistrerReleve(
      db,
      projetId,
      {
        ...r,
        quantites: [
          { ligneId: ligneA, quantite: 6.25, commentaire: null },
          { ligneId: ligneB, quantite: 2, commentaire: 'Angle nord' },
        ],
      },
      chefId,
    )
    const q = await quantitesDe(r.id)
    expect(q).toHaveLength(2)
    expect(q.find((l) => l.ligne === ligneA)?.q).toBe(6.25)
  })

  it('consigne les coulages et les livraisons, et les remplace a la mise a jour', async () => {
    const coulage = {
      ouvrage: 'Poteaux R+2, files A à C',
      classeBeton: 'C30/37',
      volumeM3: 12.5,
      bonLivraison: 'BL-4471',
      affaissementMm: 120,
      eprouvettes: 3,
      ferraillageReceptionne: true,
    }
    const livraison = {
      designation: 'Acier HA 12',
      fournisseur: null,
      quantite: 8,
      unite: 'T' as const,
      bonLivraison: null,
      conforme: false,
      reserve: 'Barres oxydées, paquet refusé.',
    }
    await enregistrerReleve(
      db,
      projetId,
      {
        ...r,
        coulages: [coulage, { ...coulage, ouvrage: 'Voile V3', volumeM3: 4 }],
        livraisons: [livraison],
      },
      chefId,
    )
    const lus = async () => ({
      coulages: await client<{ ouvrage: string; v: string }[]>`
        select ouvrage, volume_m3::text as v from releve_coulage
         where releve_journalier_id = ${r.id}::uuid order by rang`,
      livraisons: await client<{ conforme: boolean; reserve: string | null }[]>`
        select conforme, reserve from releve_livraison where releve_journalier_id = ${r.id}::uuid`,
    })
    const avant = await lus()
    expect(avant.coulages.map((c) => c.ouvrage)).toEqual(['Poteaux R+2, files A à C', 'Voile V3'])
    expect(avant.livraisons).toEqual([
      { conforme: false, reserve: 'Barres oxydées, paquet refusé.' },
    ])

    await enregistrerReleve(db, projetId, { ...r, coulages: [coulage], livraisons: [] }, chefId)
    const apres = await lus()
    expect(apres.coulages).toHaveLength(1)
    expect(Number(apres.coulages[0]?.v)).toBe(12.5)
    expect(apres.livraisons).toHaveLength(0)
    r = { ...r, coulages: [coulage] }
  })

  it('consigne les heures d engin, et refuse un engin etranger au projet', async () => {
    const [pelle] = await client<{ id: string }[]>`
      select id from ressource where projet_id = ${projetId}::uuid and nom like 'Pelle%'`
    const [grue] = await client<{ id: string }[]>`
      select id from ressource where projet_id = ${projetId}::uuid and dans_frais_chantier`
    await enregistrerReleve(
      db,
      projetId,
      { ...r, engins: [{ ressourceId: pelle?.id as string, heures: 7.5 }] },
      chefId,
    )
    const [lu] = await client<{ h: string }[]>`
      select heures::text as h from releve_engin where releve_journalier_id = ${r.id}::uuid`
    expect(Number(lu?.h)).toBe(7.5)
    // La grue est dans les frais de chantier : ses heures ne se relevent pas.
    await attendreRefus(
      enregistrerReleve(
        db,
        projetId,
        { ...r, engins: [{ ressourceId: grue?.id as string, heures: 8 }] },
        chefId,
      ),
      'INCOHERENT',
    )
    await enregistrerReleve(db, projetId, { ...r, engins: [] }, chefId)
  })

  it('la soumission fait passer le releve au statut soumis', async () => {
    const res = await enregistrerReleve(db, projetId, { ...r, soumettre: true }, chefId)
    expect(res.statut).toBe('SOUMIS')
  })

  it('un releve soumis ne redevient pas brouillon par un simple enregistrement', async () => {
    const res = await enregistrerReleve(db, projetId, { ...r, soumettre: false }, chefId)
    expect(res.statut).toBe('SOUMIS')
  })

  it('un brouillon soumis par la fonction dediee passe aussi au statut soumis', async () => {
    const b = saisie({ lotId: autreLotId, quantites: [] })
    await enregistrerReleve(db, projetId, b, chefId)
    expect(await soumettreReleve(db, b.id, chefId)).toEqual({ modifie: true })
    expect(await soumettreReleve(db, b.id, chefId)).toEqual({ modifie: false })
  })

  it('situe le releve dans son projet, pour la garde', async () => {
    expect(await projetDuReleve(db, r.id)).toBe(projetId)
    expect(await projetDuReleve(db, randomUUID())).toBeNull()
  })
})

describe('refus explicites', () => {
  it('refuse un second releve actif sur le meme lot et le meme jour', async () => {
    const message = await attendreRefus(
      enregistrerReleve(db, projetId, saisie(), chefId),
      'CONFLIT',
    )
    expect(message).toMatch(/existe déjà pour ce lot le 01\/10\/2026/)
    expect(await relevesDuJour()).toHaveLength(1)
  })

  it('deux saisies simultanees : une seule passe, l autre est refusee proprement', async () => {
    const jour = '2026-10-02'
    const [a, b] = await Promise.allSettled([
      enregistrerReleve(
        db,
        projetId,
        saisie({ date: jour, lotId: autreLotId, quantites: [] }),
        chefId,
      ),
      enregistrerReleve(
        db,
        projetId,
        saisie({ date: jour, lotId: autreLotId, quantites: [] }),
        conducteurId,
      ),
    ])
    const statuts = [a?.status, b?.status].sort()
    expect(statuts).toEqual(['fulfilled', 'rejected'])
    const refus = [a, b].find((x) => x?.status === 'rejected') as PromiseRejectedResult
    expect(refus.reason).toBeInstanceOf(RefusMetier)
    expect((refus.reason as RefusMetier).code).toBe('CONFLIT')

    const [n] = await client<{ n: number }[]>`
      select count(*)::int as n from releve_journalier
       where lot_id = ${autreLotId}::uuid and date = ${jour}::date`
    expect(n?.n).toBe(1)
  })

  it('refuse une ligne du quantitatif etrangere au lot', async () => {
    await attendreRefus(
      enregistrerReleve(
        db,
        projetId,
        saisie({
          date: '2026-10-03',
          quantites: [{ ligneId: ligneAutreLot, quantite: 1, commentaire: null }],
        }),
        chefId,
      ),
      'INCOHERENT',
    )
    expect(
      await client`select 1 from releve_journalier where date = '2026-10-03'::date`,
    ).toHaveLength(0)
  })

  it('refuse un lot qui n appartient pas au projet', async () => {
    await attendreRefus(
      enregistrerReleve(db, projetId, saisie({ lotId: randomUUID(), quantites: [] }), chefId),
      'INCOHERENT',
    )
  })
})

describe('validation et gel', () => {
  let releveId: string

  it('la validation fait bouger l avancement du projet immediatement', async () => {
    const [r] = await relevesDuJour()
    releveId = r?.id as string
    const avant = await recompute(db, projetId)
    const v = await validerReleve(db, releveId, conducteurId)
    expect(v.modifie).toBe(true)
    expect(v.recalcul?.avancement).toBeGreaterThan(avant.avancement)
    expect(v.recalcul?.valeurAcquiseXof).toBeGreaterThan(avant.valeurAcquiseXof)
  })

  it('un releve valide ne se modifie plus par la saisie', async () => {
    const [ligne] = await client<{ lot: string }[]>`
      select lot_id as lot from releve_journalier where id = ${releveId}::uuid`
    const message = await attendreRefus(
      enregistrerReleve(
        db,
        projetId,
        saisie({ id: releveId, lotId: ligne?.lot as string }),
        chefId,
      ),
      'GELE',
    )
    expect(message).toMatch(/rectificatif/)
  })

  it('la base refuse toute modification directe d un releve valide', async () => {
    await expect(
      client`update releve_journalier set effectif_ouvriers = 99 where id = ${releveId}::uuid`,
    ).rejects.toMatchObject({ code: 'CS001' })
    await expect(
      client`update releve_journalier set statut = 'SOUMIS' where id = ${releveId}::uuid`,
    ).rejects.toMatchObject({ code: 'CS001' })
  })

  it('la base refuse toute modification des quantites d un releve valide', async () => {
    await expect(
      client`update releve_quantite set quantite_realisee = 999
              where releve_journalier_id = ${releveId}::uuid`,
    ).rejects.toMatchObject({ code: 'CS001' })
    await expect(
      client`delete from releve_quantite where releve_journalier_id = ${releveId}::uuid`,
    ).rejects.toMatchObject({ code: 'CS001' })
    await expect(
      client`insert into releve_quantite (releve_journalier_id, ligne_quantitatif_id, quantite_realisee)
             values (${releveId}::uuid, ${ligneAutreLot}::uuid, 1)`,
    ).rejects.toMatchObject({ code: 'CS001' })
  })

  it('la base refuse toute modification du journal d un releve valide', async () => {
    await expect(
      client`delete from releve_coulage where releve_journalier_id = ${releveId}::uuid`,
    ).rejects.toMatchObject({ code: 'CS001' })
    await expect(
      client`insert into releve_livraison (releve_journalier_id, designation, quantite, unite)
             values (${releveId}::uuid, 'Sable', 5, 'M3')`,
    ).rejects.toMatchObject({ code: 'CS001' })
  })

  it('la base refuse la suppression d un releve valide', async () => {
    await expect(
      client`delete from releve_journalier where id = ${releveId}::uuid`,
    ).rejects.toMatchObject({ code: 'CS001' })
  })

  it('la meteo absente d un releve valide peut etre completee, une seule fois', async () => {
    const [cible] = await client<{ id: string }[]>`
      select id from releve_journalier where statut = 'VALIDE' and date < '2026-09-01' limit 1`
    // Mise en situation : la meteo absente est preparee hors declencheur.
    await client.begin(async (tx) => {
      await tx`alter table releve_journalier disable trigger gel_releve_journalier`
      await tx`update releve_journalier set meteo_code = null, temperature_c = null,
                                            precipitations_mm = null, rafales_kmh = null
                where id = ${cible?.id as string}::uuid`
      await tx`alter table releve_journalier enable trigger gel_releve_journalier`
    })

    await client`update releve_journalier
                    set meteo_code = 61, temperature_c = 26, precipitations_mm = 14.2, rafales_kmh = 22
                  where id = ${cible?.id as string}::uuid`

    // Une meteo renseignee devient une observation : elle ne change plus.
    await expect(
      client`update releve_journalier set precipitations_mm = 0 where id = ${cible?.id as string}::uuid`,
    ).rejects.toMatchObject({ code: 'CS001' })
  })

  it('la suppression en cascade d un lot reste possible', async () => {
    // Executee dans une transaction annulee : on verifie que la base
    // l'accepte, sans perdre le lot pour la suite.
    const annulation = new Error('annulation volontaire')
    await expect(
      client.begin(async (tx) => {
        await tx`delete from lot where id = ${lotId}::uuid`
        throw annulation
      }),
    ).rejects.toBe(annulation)
    expect(await client`select 1 from lot where id = ${lotId}::uuid`).toHaveLength(1)
  })
})

describe('rectification', () => {
  let ancienId: string
  const rectificatif = () =>
    saisie({
      id: idRectificatif,
      quantites: [{ ligneId: ligneA, quantite: 9, commentaire: 'Metre repris' }],
      observations: 'Rectification apres metre contradictoire',
    })
  const idRectificatif = randomUUID()

  beforeAll(async () => {
    const [r] = await relevesDuJour()
    ancienId = r?.id as string
  })

  it('remplace le releve valide sans l effacer', async () => {
    const res = await rectifierReleve(db, projetId, ancienId, rectificatif(), conducteurId)
    expect(res.nouveauId).toBe(idRectificatif)

    const lignes = await client<
      {
        id: string
        statut: string
        remplace: string | null
        valideur: string | null
      }[]
    >`
      select id, statut::text as statut, remplace_par as remplace, valide_par_id as valideur
        from releve_journalier where id in (${ancienId}::uuid, ${idRectificatif}::uuid)`
    const ancien = lignes.find((l) => l.id === ancienId)
    const nouveau = lignes.find((l) => l.id === idRectificatif)
    expect(ancien?.statut).toBe('RECTIFIE')
    expect(ancien?.remplace).toBe(idRectificatif)
    expect(nouveau?.statut).toBe('VALIDE')
    expect(nouveau?.valideur).toBe(conducteurId)

    // L'ancien conserve ses quantites, comme trace.
    expect((await quantitesDe(ancienId)).length).toBeGreaterThan(0)
    expect(await quantitesDe(idRectificatif)).toEqual([{ ligne: ligneA, q: 9 }])
  })

  it('les indicateurs ne comptent que le rectificatif', async () => {
    const [n] = await client<{ q: string }[]>`
      select coalesce(sum(q.quantite_realisee), 0)::text as q
        from releve_quantite q
        join releve_journalier r on r.id = q.releve_journalier_id
       where r.date = ${JOUR}::date and r.lot_id = ${lotId}::uuid and r.statut = 'VALIDE'
         and q.ligne_quantitatif_id = ${ligneB}::uuid`
    // La ligne B figurait dans l'ancien releve, pas dans le rectificatif.
    expect(Number(n?.q)).toBe(0)
  })

  it('un second envoi du meme rectificatif ne modifie rien', async () => {
    const res = await rectifierReleve(db, projetId, ancienId, rectificatif(), conducteurId)
    expect(res.nouveauId).toBe(idRectificatif)
    expect(await relevesDuJour()).toHaveLength(2)
  })

  it('un releve deja rectifie ne se rectifie pas une seconde fois', async () => {
    const message = await attendreRefus(
      rectifierReleve(db, projetId, ancienId, saisie(), conducteurId),
      'INCOHERENT',
    )
    expect(message).toMatch(/déjà été rectifié/)
  })

  it('un rectificatif porte sur le meme lot et le meme jour', async () => {
    await attendreRefus(
      rectifierReleve(db, projetId, idRectificatif, saisie({ date: '2026-09-30' }), conducteurId),
      'INCOHERENT',
    )
  })

  it('un releve non valide ne se rectifie pas', async () => {
    const b = saisie({ lotId: autreLotId, date: '2026-10-04', quantites: [] })
    await enregistrerReleve(db, projetId, b, chefId)
    await attendreRefus(rectifierReleve(db, projetId, b.id, saisie(), conducteurId), 'INCOHERENT')
  })

  it('un releve d un autre projet est introuvable', async () => {
    await attendreRefus(
      rectifierReleve(db, randomUUID(), ancienId, saisie(), conducteurId),
      'INTROUVABLE',
    )
  })
})

describe('alea declare depuis un releve', () => {
  let r: ReleveSaisi

  beforeAll(() => {
    r = saisie({
      lotId: autreLotId,
      date: '2026-10-05',
      quantites: [],
      alea: {
        type: 'PANNE_ENGIN',
        gravite: 2,
        description: 'Bétonnière hors service',
        impactDelaiJ: 1,
        impactCoutXof: 450_000,
      },
    })
  })

  async function aleasDuReleve(): Promise<{ cout: number; type: string }[]> {
    const lignes = await client<{ cout: string; type: string }[]>`
      select impact_cout_xof::text as cout, type::text as type
        from alea where releve_journalier_id = ${r.id}::uuid`
    return lignes.map((l) => ({ cout: Number(l.cout), type: l.type }))
  }

  it('est enregistre et entre dans le cout reel', async () => {
    // Date d'analyse explicite : l'alea est posterieur au jeu de
    // demonstration, et ne doit pas dependre du jour d'execution.
    const fin = { dateAnalyse: '2026-10-31' }
    const avant = await recompute(db, projetId, fin)
    await enregistrerReleve(db, projetId, r, chefId)
    const apres = await recompute(db, projetId, fin)
    expect(await aleasDuReleve()).toEqual([{ cout: 450_000, type: 'PANNE_ENGIN' }])
    expect(apres.coutReelXof - avant.coutReelXof).toBe(450_000)
  })

  it('un renvoi met l alea a jour au lieu de le dupliquer', async () => {
    await enregistrerReleve(
      db,
      projetId,
      { ...r, alea: { ...(r.alea as NonNullable<typeof r.alea>), impactCoutXof: 500_000 } },
      chefId,
    )
    expect(await aleasDuReleve()).toEqual([{ cout: 500_000, type: 'PANNE_ENGIN' }])
  })

  it('retirer l alea du releve le supprime', async () => {
    await enregistrerReleve(db, projetId, { ...r, alea: null }, chefId)
    expect(await aleasDuReleve()).toEqual([])
  })
})

describe('cloisonnement entre projets', () => {
  let projetB: string
  let lotB: string
  let releveB: string

  beforeAll(async () => {
    const [p] = await client<{ id: string }[]>`
      insert into projet (code, nom, maitre_ouvrage, maitre_oeuvre, entreprise, lieu,
                          latitude, longitude, date_ordre_service, duree_contractuelle_j,
                          date_fin_contractuelle, montant_marche_xof)
      values ('TEST-B', 'Projet B', 'MOA B', 'MOE B', 'Entreprise B', 'Ailleurs',
              5.3, -4.0, '2026-01-05', 100, '2026-04-14', 1000000)
      returning id`
    projetB = p?.id as string
    const [l] = await client<{ id: string }[]>`
      insert into lot (projet_id, code, nom, ordre, budget_xof, rang_couleur)
      values (${projetB}::uuid, '01-B', 'Lot B', 1, 1000000, 0) returning id`
    lotB = l?.id as string
    releveB = randomUUID()
    await client`
      insert into releve_journalier (id, projet_id, lot_id, date, statut, observations)
      values (${releveB}::uuid, ${projetB}::uuid, ${lotB}::uuid, '2026-02-02', 'BROUILLON',
              'Relevé du projet B')`
  })

  afterAll(async () => {
    await client`delete from projet where id = ${projetB}::uuid`
  })

  it('un releve d un autre projet ne se reecrit pas depuis ce projet', async () => {
    await attendreRefus(
      enregistrerReleve(db, projetId, saisie({ id: releveB, date: '2026-10-02' }), chefId),
      'INTROUVABLE',
    )
    const [b] = await client<{ projetId: string; lotId: string; observations: string }[]>`
      select projet_id as "projetId", lot_id as "lotId", observations
        from releve_journalier where id = ${releveB}::uuid`
    expect(b).toEqual({
      projetId: projetB,
      lotId: lotB,
      observations: 'Relevé du projet B',
    })
  })

  it('la base refuse un releve rattache au lot d un autre projet', async () => {
    await expect(client`
      insert into releve_journalier (id, projet_id, lot_id, date)
      values (${randomUUID()}::uuid, ${projetId}::uuid, ${lotB}::uuid, '2026-10-03')`).rejects.toThrow(
      /releve_lot_meme_projet/,
    )
  })
})

describe('versions concurrentes', () => {
  it('une version plus ancienne arrivee apres une recente ne l ecrase pas', async () => {
    const s = saisie({ date: '2026-10-05', lotId, revision: 2_000, effectifOuvriers: 12 })
    await enregistrerReleve(db, projetId, s, chefId)
    const r = await enregistrerReleve(
      db,
      projetId,
      { ...s, revision: 1_000, effectifOuvriers: 3 },
      chefId,
    )
    expect(r.depasse).toBe(true)
    const [l] = await client<{ n: number }[]>`
      select effectif_ouvriers as n from releve_journalier where id = ${s.id}::uuid`
    expect(l?.n).toBe(12)
  })

  it('une version plus recente remplace l ancienne', async () => {
    const s = saisie({ date: '2026-10-06', lotId, revision: 1_000, effectifOuvriers: 4 })
    await enregistrerReleve(db, projetId, s, chefId)
    await enregistrerReleve(db, projetId, { ...s, revision: 3_000, effectifOuvriers: 9 }, chefId)
    const [l] = await client<{ n: number }[]>`
      select effectif_ouvriers as n from releve_journalier where id = ${s.id}::uuid`
    expect(l?.n).toBe(9)
  })

  it('la validation refuse un releve modifie depuis son affichage', async () => {
    const s = saisie({ date: '2026-10-07', lotId, soumettre: true, revision: 1 })
    await enregistrerReleve(db, projetId, s, chefId)
    const [vue] = await client<{ v: string }[]>`
      select modifie_le::text as v from releve_journalier where id = ${s.id}::uuid`
    await enregistrerReleve(db, projetId, { ...s, revision: 2, effectifOuvriers: 30 }, chefId)
    await attendreRefus(validerReleve(db, s.id, conducteurId, vue?.v), 'PERIME')
    const [apres] = await client<{ v: string }[]>`
      select modifie_le::text as v from releve_journalier where id = ${s.id}::uuid`
    const r = await validerReleve(db, s.id, conducteurId, apres?.v)
    expect(r.modifie).toBe(true)
  })
})

describe('validation groupee', () => {
  it('valide la selection en un recalcul, et rend a part les releves modifies', async () => {
    const a = saisie({ date: '2026-10-08', lotId, soumettre: true, revision: 1 })
    const b = saisie({ date: '2026-10-09', lotId, soumettre: true, revision: 1 })
    await enregistrerReleve(db, projetId, a, chefId)
    await enregistrerReleve(db, projetId, b, chefId)
    const versions = await client<{ id: string; v: string }[]>`
      select id, modifie_le::text as v from releve_journalier
       where id in (${a.id}::uuid, ${b.id}::uuid)`
    const version = (id: string) => versions.find((x) => x.id === id)?.v as string
    // b change apres l'affichage : il ne doit pas etre valide a l'aveugle.
    await enregistrerReleve(db, projetId, { ...b, revision: 2, effectifOuvriers: 25 }, chefId)

    const r = await validerReleves(
      db,
      projetId,
      [
        { id: a.id, version: version(a.id) },
        { id: b.id, version: version(b.id) },
      ],
      conducteurId,
    )
    expect(r.valides).toEqual([a.id])
    expect(r.perimes).toEqual([b.id])
    expect(r.recalcul).not.toBeNull()
  })

  it('ignore un releve d un autre projet glisse dans la selection', async () => {
    const r = await validerReleves(
      db,
      randomUUID(),
      [{ id: randomUUID(), version: '2026-10-08 10:00:00+00' }],
      conducteurId,
    )
    expect(r.valides).toEqual([])
  })
})
