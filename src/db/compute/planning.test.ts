import { describe, expect, it } from 'vitest'
import { datesNoeuds, modifierTache, recaler, verifierLiaison } from '@/db/compute/planning'
import { ATTENDU_REFERENCE, RESEAU_REFERENCE } from '@/db/compute/reference'

describe('recalage des dates prevues', () => {
  it('donne les dates au plus tot du calcul manuel', () => {
    const { dates } = recaler(RESEAU_REFERENCE)
    expect(dates.get('A')).toEqual({ debut: 0, fin: 4 })
    expect(dates.get('F')).toEqual({ debut: 19, fin: 22 })
    expect(dates.get('J')).toEqual({ debut: 31, fin: 34 })
  })

  it('allonger une tache critique repousse toutes ses suivantes', () => {
    // B passe de 8 a 10 jours : D, F, G, I, J glissent de deux jours.
    const { dates, resultat } = recaler(modifierTache(RESEAU_REFERENCE, 'B', { duree: 10 }))
    expect(dates.get('D')).toEqual({ debut: 15, fin: 20 })
    expect(dates.get('J')).toEqual({ debut: 33, fin: 36 })
    expect(resultat.dureeTotale).toBe(ATTENDU_REFERENCE.dureeTotale + 2)
  })

  it('allonger une tache dans sa marge ne repousse rien', () => {
    // C a quatre jours de marge totale : passer de 3 a 6 jours est absorbe.
    const { resultat } = recaler(modifierTache(RESEAU_REFERENCE, 'C', { duree: 6 }))
    expect(resultat.dureeTotale).toBe(35)
  })

  it('une contrainte de debut plus tardive deplace la tache et sa suite', () => {
    const { dates } = recaler(modifierTache(RESEAU_REFERENCE, 'H', { debutImpose: 26 }))
    expect(dates.get('H')).toEqual({ debut: 26, fin: 27 })
    // H finit le jour 27, comme G : I ne bouge pas, H a consomme sa marge.
    expect(dates.get('I')).toEqual({ debut: 28, fin: 30 })
  })

  it('une contrainte plus precoce que les predecesseurs est sans effet', () => {
    const { dates } = recaler(modifierTache(RESEAU_REFERENCE, 'D', { debutImpose: 2 }))
    expect(dates.get('D')).toEqual({ debut: 13, fin: 18 })
  })

  it('retirer la contrainte rend la tache a ses predecesseurs', () => {
    const contraint = modifierTache(RESEAU_REFERENCE, 'H', { debutImpose: 26 })
    const libere = modifierTache(contraint, 'H', { debutImpose: null })
    expect(recaler(libere).dates.get('H')).toEqual({ debut: 23, fin: 24 })
  })

  it('ne modifie jamais le reseau d origine', () => {
    modifierTache(RESEAU_REFERENCE, 'B', { duree: 99 })
    expect(RESEAU_REFERENCE.taches.find((t) => t.id === 'B')?.duree).toBe(8)
  })

  it('refuse une duree nulle, negative ou fractionnaire', () => {
    for (const duree of [0, -2, 1.5]) {
      expect(() => modifierTache(RESEAU_REFERENCE, 'B', { duree })).toThrow(/entier/)
    }
  })

  it('refuse une tache inconnue', () => {
    expect(() => modifierTache(RESEAU_REFERENCE, 'Z', { duree: 2 })).toThrow(/inconnue/)
  })
})

describe('dates des noeuds de WBS', () => {
  it('couvrent du plus tot debut au plus tard fin des descendants, a tous les niveaux', () => {
    const noeuds = [
      { id: 'lot', parentId: null },
      { id: 'n1', parentId: 'lot' },
      { id: 'n2', parentId: 'lot' },
    ]
    const feuilles = new Map([
      ['a', { debut: 5, fin: 9, parentId: 'n1' }],
      ['b', { debut: 2, fin: 4, parentId: 'n1' }],
      ['c', { debut: 12, fin: 20, parentId: 'n2' }],
    ])
    const d = datesNoeuds(noeuds, feuilles)
    expect(d.get('n1')).toEqual({ debut: 2, fin: 9 })
    expect(d.get('n2')).toEqual({ debut: 12, fin: 20 })
    expect(d.get('lot')).toEqual({ debut: 2, fin: 20 })
  })
})

describe('controle d une liaison candidate', () => {
  it('admet une liaison qui ne ferme aucun circuit', () => {
    expect(
      verifierLiaison(RESEAU_REFERENCE, { amont: 'C', aval: 'H', type: 'FD', decalage: 0 }),
    ).toEqual({ admise: true })
  })

  it('refuse une liaison qui ferme un circuit et nomme les taches du circuit', () => {
    // J depend de A par transitivite : J vers A boucle sur tout le chemin.
    const v = verifierLiaison(RESEAU_REFERENCE, { amont: 'J', aval: 'B', type: 'FD', decalage: 0 })
    expect(v.admise).toBe(false)
    if (!v.admise) {
      expect(v.motif).toBe('boucle')
      expect(v.taches).toEqual(expect.arrayContaining(['B', 'D', 'F', 'I', 'J']))
      // A n'est pas dans la boucle : il n'est pas nomme.
      expect(v.taches).not.toContain('A')
    }
  })

  it('refuse une tache reliee a elle-meme', () => {
    expect(
      verifierLiaison(RESEAU_REFERENCE, { amont: 'C', aval: 'C', type: 'FD', decalage: 0 }),
    ).toEqual({ admise: false, motif: 'boucle', taches: ['C'] })
  })

  it('refuse un doublon entre les memes taches', () => {
    const v = verifierLiaison(RESEAU_REFERENCE, { amont: 'A', aval: 'B', type: 'DD', decalage: 2 })
    expect(v).toEqual({ admise: false, motif: 'doublon', taches: ['A', 'B'] })
  })

  it('refuse une tache absente du reseau', () => {
    const v = verifierLiaison(RESEAU_REFERENCE, { amont: 'A', aval: 'Z', type: 'FD', decalage: 0 })
    expect(v.admise).toBe(false)
  })
})
