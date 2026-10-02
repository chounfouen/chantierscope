import { describe, expect, it } from 'vitest'
import { ETAPES, ReleveSaisi } from '@/lib/releve'
import {
  enTexte,
  etatDepuisReleve,
  etatVierge,
  heuresProposees,
  nouvelIdentifiant,
  versReleve,
  type EtatFormulaire,
} from '@/lib/releve-formulaire'

const ID = '0f0e0d0c-0b0a-4908-8706-050403020100'
const LOT = '2b1c6f1e-6a1f-4c35-9c7d-0d6f3f1a2b3c'
const LIGNE_A = '7f9e8d7c-6b5a-4c3d-8e1f-0a1b2c3d4e5f'
const LIGNE_B = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d'

function rempli(modifs: Partial<EtatFormulaire> = {}): EtatFormulaire {
  return {
    ...etatVierge(ID, '2026-10-01', LOT),
    meteoCode: '3',
    temperatureC: '31,5',
    precipitationsMm: '0',
    rafalesKmh: '12',
    effectifOuvriers: '12',
    effectifEncadrement: '2',
    heuresTravaillees: '96',
    quantites: {
      [LIGNE_A]: { quantite: '14,5', commentaire: '' },
      [LIGNE_B]: { quantite: '', commentaire: '' },
    },
    ...modifs,
  }
}

describe('conversion du formulaire en releve', () => {
  it('produit un releve que le schema accepte', () => {
    const r = ReleveSaisi.safeParse(versReleve(rempli(), true))
    expect(r.success).toBe(true)
  })

  it('lit la virgule decimale des champs', () => {
    const r = ReleveSaisi.parse(versReleve(rempli(), false))
    expect(r.temperatureC).toBe(31.5)
    expect(r.quantites[0]?.quantite).toBe(14.5)
  })

  it('omet les lignes laissees vides : ne rien saisir n est pas declarer zero', () => {
    const r = ReleveSaisi.parse(versReleve(rempli(), false))
    expect(r.quantites.map((q) => q.ligneId)).toEqual([LIGNE_A])
  })

  it('un champ illisible est refuse plutot que lu comme zero', () => {
    const e = rempli({ quantites: { [LIGNE_A]: { quantite: '12,5,3', commentaire: '' } } })
    expect(ReleveSaisi.safeParse(versReleve(e, false)).success).toBe(false)
  })

  it('une meteo vide reste inconnue, a completer par la tache nocturne', () => {
    const e = rempli({ meteoCode: '', temperatureC: '', precipitationsMm: '', rafalesKmh: '' })
    const r = ReleveSaisi.parse(versReleve(e, false))
    expect(r.precipitationsMm).toBeNull()
  })

  it('une journee arretee ne transmet ni quantite ni heures fantomes', () => {
    const e = rempli({
      journeeTravaillee: false,
      motifArret: '  Pluie forte  ',
      effectifOuvriers: '',
      heuresTravaillees: '',
    })
    const r = ReleveSaisi.parse(versReleve(e, true))
    expect(r.quantites).toEqual([])
    expect(r.motifArret).toBe('Pluie forte')
    expect(r.heuresTravaillees).toBe(0)
  })

  it('le motif d arret n est transmis que pour une journee arretee', () => {
    const r = ReleveSaisi.parse(versReleve(rempli({ motifArret: 'reste d une saisie' }), false))
    expect(r.motifArret).toBeNull()
  })

  it('l alea n est transmis que s il est declare', () => {
    const sans = ReleveSaisi.parse(versReleve(rempli(), false))
    expect(sans.alea).toBeNull()

    const avec = ReleveSaisi.parse(
      versReleve(
        rempli({
          aleaDeclare: true,
          alea: {
            type: 'PANNE_ENGIN',
            gravite: '3',
            description: 'Grue a l arret',
            impactDelaiJ: '2',
            impactCoutXof: '600000',
          },
        }),
        false,
      ),
    )
    expect(avec.alea).toEqual({
      type: 'PANNE_ENGIN',
      gravite: 3,
      description: 'Grue a l arret',
      impactDelaiJ: 2,
      impactCoutXof: 600_000,
    })
  })

  it('transmet l intention de soumettre', () => {
    expect(ReleveSaisi.parse(versReleve(rempli(), true)).soumettre).toBe(true)
    expect(ReleveSaisi.parse(versReleve(rempli(), false)).soumettre).toBe(false)
  })

  it('chaque etape se valide isolement sur le releve converti', () => {
    const r = versReleve(rempli(), true)
    for (const etape of ETAPES) expect(etape.schema.safeParse(r).success, etape.cle).toBe(true)
  })
})

describe('aller-retour avec un releve existant', () => {
  it('restitue le releve a l identique', () => {
    const origine = ReleveSaisi.parse(
      versReleve(
        rempli({
          observations: 'Coulage dalle',
          aleaDeclare: true,
          alea: {
            type: 'INTEMPERIE',
            gravite: '2',
            description: 'Orage en fin de journee',
            impactDelaiJ: '1',
            impactCoutXof: '0',
          },
        }),
        false,
      ),
    )
    const { id, soumettre, ...reste } = origine
    const retour = ReleveSaisi.parse(versReleve(etatDepuisReleve(id, reste), soumettre))
    expect(retour).toEqual(origine)
  })
})

describe('utilitaires de saisie', () => {
  it('affiche les nombres avec la virgule decimale', () => {
    expect(enTexte(12.5)).toBe('12,5')
    expect(enTexte(3)).toBe('3')
  })

  it('propose huit heures par ouvrier', () => {
    expect(heuresProposees('12')).toBe('96')
    expect(heuresProposees('')).toBe('')
    expect(heuresProposees('0')).toBe('')
  })
})

describe('identifiant d un nouveau releve', () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('produit un UUID v4', () => {
    expect(nouvelIdentifiant()).toMatch(UUID_V4)
  })

  it('produit un UUID v4 sans randomUUID, hors contexte securise', () => {
    const alea = { getRandomValues: <T extends ArrayBufferView>(t: T) => crypto.getRandomValues(t) }
    for (let i = 0; i < 50; i++) expect(nouvelIdentifiant(alea as Crypto)).toMatch(UUID_V4)
  })

  it('ne se repete pas', () => {
    const vus = new Set(Array.from({ length: 1000 }, () => nouvelIdentifiant()))
    expect(vus.size).toBe(1000)
  })
})
