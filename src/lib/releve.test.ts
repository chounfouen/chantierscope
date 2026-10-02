import { describe, expect, it } from 'vitest'
import {
  AleaSaisi,
  DateSimple,
  ETAPES,
  EtapeMeteo,
  EtapeMoyens,
  EtapeQuantites,
  ReleveSaisi,
  erreursParChamp,
  lireNombre,
  type ReleveSaisi as TypeReleve,
} from '@/lib/releve'

const LOT = '2b1c6f1e-6a1f-4c35-9c7d-0d6f3f1a2b3c'
const LIGNE_A = '7f9e8d7c-6b5a-4c3d-8e1f-0a1b2c3d4e5f'
const LIGNE_B = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d'

function releve(modifs: Partial<TypeReleve> = {}): TypeReleve {
  return {
    id: '0f0e0d0c-0b0a-4908-8706-050403020100',
    soumettre: true,
    date: '2026-10-01',
    lotId: LOT,
    meteoCode: 3,
    temperatureC: 31.2,
    precipitationsMm: 0,
    rafalesKmh: 18,
    meteoCorrigee: false,
    journeeTravaillee: true,
    motifArret: null,
    effectifOuvriers: 12,
    effectifEncadrement: 2,
    heuresTravaillees: 96,
    quantites: [{ ligneId: LIGNE_A, quantite: 14.5, commentaire: null }],
    observations: null,
    alea: null,
    ...modifs,
  }
}

describe('lecture d un nombre saisi au clavier', () => {
  it('accepte la virgule decimale francaise', () => {
    expect(lireNombre('12,5')).toBe(12.5)
  })

  it('accepte le point decimal des claviers numeriques', () => {
    expect(lireNombre('12.5')).toBe(12.5)
  })

  it('ignore les espaces de groupement, y compris insecables', () => {
    expect(lireNombre('1 250,75')).toBe(1250.75)
    expect(lireNombre('1 250')).toBe(1250)
    expect(lireNombre('1 250')).toBe(1250)
  })

  it('renvoie nul pour une saisie vide plutot que zero', () => {
    expect(lireNombre('')).toBeNull()
    expect(lireNombre('   ')).toBeNull()
  })

  it('renvoie nul pour une saisie illisible', () => {
    expect(lireNombre('12,5,3')).toBeNull()
    expect(lireNombre('abc')).toBeNull()
    expect(lireNombre('1e5')).toBeNull()
  })

  it('accepte zero, les decimales sans partie entiere et un separateur final', () => {
    expect(lireNombre('0')).toBe(0)
    expect(lireNombre(',5')).toBe(0.5)
    expect(lireNombre('12,')).toBe(12)
  })
})

describe('date de planning', () => {
  it('accepte une date au format AAAA-MM-JJ', () => {
    expect(DateSimple.safeParse('2026-10-01').success).toBe(true)
  })

  it('refuse un horodatage : une journee de chantier n a pas d heure', () => {
    expect(DateSimple.safeParse('2026-10-01T08:00:00Z').success).toBe(false)
  })

  it('refuse une date inexistante', () => {
    expect(DateSimple.safeParse('2026-02-30').success).toBe(false)
    expect(DateSimple.safeParse('2026-13-01').success).toBe(false)
  })
})

describe('etape meteo', () => {
  const meteo = {
    meteoCode: 61,
    temperatureC: 27,
    precipitationsMm: 12.4,
    rafalesKmh: 30,
    meteoCorrigee: true,
  }

  it('accepte une meteo complete', () => {
    expect(EtapeMeteo.safeParse(meteo).success).toBe(true)
  })

  it('accepte une meteo inconnue, a completer par la tache nocturne', () => {
    const vide = { ...meteo, meteoCode: null, temperatureC: null, precipitationsMm: null }
    expect(EtapeMeteo.safeParse({ ...vide, rafalesKmh: null }).success).toBe(true)
  })

  it('refuse une pluie negative', () => {
    expect(EtapeMeteo.safeParse({ ...meteo, precipitationsMm: -1 }).success).toBe(false)
  })
})

describe('etape effectifs et heures', () => {
  const moyens = {
    journeeTravaillee: true,
    motifArret: null,
    effectifOuvriers: 10,
    effectifEncadrement: 1,
    heuresTravaillees: 80,
  }

  it('accepte une journee ordinaire', () => {
    expect(EtapeMoyens.safeParse(moyens).success).toBe(true)
  })

  it('exige la cause d une journee non travaillee', () => {
    const r = EtapeMoyens.safeParse({ ...moyens, journeeTravaillee: false, heuresTravaillees: 0 })
    expect(r.success).toBe(false)
    if (!r.success) expect(erreursParChamp(r.error)['motifArret']).toMatch(/cause/)
  })

  it('accepte une journee non travaillee motivee', () => {
    const r = EtapeMoyens.safeParse({
      ...moyens,
      journeeTravaillee: false,
      motifArret: 'Pluie forte',
      effectifOuvriers: 0,
      heuresTravaillees: 0,
    })
    expect(r.success).toBe(true)
  })

  it('plafonne les heures a douze par ouvrier present', () => {
    expect(EtapeMoyens.safeParse({ ...moyens, heuresTravaillees: 120 }).success).toBe(true)
    const r = EtapeMoyens.safeParse({ ...moyens, heuresTravaillees: 120.5 })
    expect(r.success).toBe(false)
    if (!r.success) expect(erreursParChamp(r.error)['heuresTravaillees']).toMatch(/12 heures/)
  })

  it('refuse des ouvriers presents sans aucune heure', () => {
    expect(EtapeMoyens.safeParse({ ...moyens, heuresTravaillees: 0 }).success).toBe(false)
  })

  it('refuse un effectif fractionnaire', () => {
    expect(EtapeMoyens.safeParse({ ...moyens, effectifOuvriers: 10.5 }).success).toBe(false)
  })
})

describe('etape quantites', () => {
  it('accepte trois decimales, precision de la colonne en base', () => {
    const r = EtapeQuantites.safeParse({
      quantites: [{ ligneId: LIGNE_A, quantite: 12.125, commentaire: null }],
    })
    expect(r.success).toBe(true)
  })

  it('refuse une quatrieme decimale plutot que de l arrondir en silence', () => {
    const r = EtapeQuantites.safeParse({
      quantites: [{ ligneId: LIGNE_A, quantite: 12.1255, commentaire: null }],
    })
    expect(r.success).toBe(false)
  })

  it('refuse une quantite nulle ou negative', () => {
    for (const quantite of [0, -3]) {
      const r = EtapeQuantites.safeParse({
        quantites: [{ ligneId: LIGNE_A, quantite, commentaire: null }],
      })
      expect(r.success).toBe(false)
    }
  })

  it('refuse deux saisies sur la meme ligne', () => {
    const r = EtapeQuantites.safeParse({
      quantites: [
        { ligneId: LIGNE_A, quantite: 1, commentaire: null },
        { ligneId: LIGNE_A, quantite: 2, commentaire: null },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('accepte une journee sans quantite', () => {
    expect(EtapeQuantites.safeParse({ quantites: [] }).success).toBe(true)
  })
})

describe('alea', () => {
  const alea = {
    type: 'PANNE_ENGIN',
    gravite: 2,
    description: 'Pompe a beton en panne',
    impactDelaiJ: 1,
    impactCoutXof: 350_000,
  }

  it('accepte un alea complet', () => {
    expect(AleaSaisi.safeParse(alea).success).toBe(true)
  })

  it('borne la gravite de un a quatre', () => {
    expect(AleaSaisi.safeParse({ ...alea, gravite: 0 }).success).toBe(false)
    expect(AleaSaisi.safeParse({ ...alea, gravite: 5 }).success).toBe(false)
  })

  it('refuse un type inconnu', () => {
    expect(AleaSaisi.safeParse({ ...alea, type: 'GREVE' }).success).toBe(false)
  })

  it('refuse un cout fractionnaire : les montants sont des FCFA entiers', () => {
    expect(AleaSaisi.safeParse({ ...alea, impactCoutXof: 1000.5 }).success).toBe(false)
  })
})

describe('releve complet', () => {
  it('accepte un releve ordinaire', () => {
    expect(ReleveSaisi.safeParse(releve()).success).toBe(true)
  })

  it('accepte plusieurs lignes et un alea', () => {
    const r = ReleveSaisi.safeParse(
      releve({
        quantites: [
          { ligneId: LIGNE_A, quantite: 3, commentaire: null },
          { ligneId: LIGNE_B, quantite: 4.25, commentaire: 'Reprise angle nord' },
        ],
        alea: {
          type: 'INCIDENT',
          gravite: 1,
          description: 'Livraison de parpaings en retard',
          impactDelaiJ: 0,
          impactCoutXof: 0,
        },
      }),
    )
    expect(r.success).toBe(true)
  })

  it('refuse des quantites sur une journee non travaillee', () => {
    const r = ReleveSaisi.safeParse(
      releve({
        journeeTravaillee: false,
        motifArret: 'Pluie',
        effectifOuvriers: 0,
        heuresTravaillees: 0,
      }),
    )
    expect(r.success).toBe(false)
    if (!r.success) expect(erreursParChamp(r.error)['quantites']).toMatch(/non travaill/)
  })

  it('applique les regles de chaque etape', () => {
    expect(ReleveSaisi.safeParse(releve({ heuresTravaillees: 500 })).success).toBe(false)
    expect(ReleveSaisi.safeParse(releve({ date: '2026-02-30' })).success).toBe(false)
  })

  it('exige un identifiant genere par le navigateur', () => {
    expect(ReleveSaisi.safeParse(releve({ id: 'pas-un-uuid' })).success).toBe(false)
  })

  it('refuse une cle inconnue sans la propager', () => {
    const r = ReleveSaisi.safeParse({ ...releve(), statut: 'VALIDE' })
    // L'objet est accepte, mais la cle forgee ne survit pas a l'analyse : le
    // statut d'un releve ne se choisit pas depuis le navigateur.
    expect(r.success).toBe(true)
    if (r.success) expect('statut' in r.data).toBe(false)
  })
})

describe('etapes du formulaire', () => {
  it('suivent l ordre de la conception', () => {
    expect(ETAPES.map((e) => e.cle)).toEqual([
      'dateLot',
      'meteo',
      'moyens',
      'quantites',
      'observations',
      'alea',
    ])
  })

  it('le releve complet couvre les champs de chaque etape', () => {
    const complet = releve()
    for (const etape of ETAPES) {
      expect(etape.schema.safeParse(complet).success, etape.cle).toBe(true)
    }
  })
})

describe('erreurs par champ', () => {
  it('garde le premier message de chaque champ et range a part les erreurs globales', () => {
    const r = EtapeQuantites.safeParse({
      quantites: [
        { ligneId: LIGNE_A, quantite: -1, commentaire: null },
        { ligneId: LIGNE_A, quantite: 2, commentaire: null },
      ],
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const e = erreursParChamp(r.error)
      expect(e['quantites.0.quantite']).toMatch(/strictement positive/)
      expect(e['quantites']).toMatch(/deux fois/)
    }
  })
})
