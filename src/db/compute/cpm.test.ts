/**
 * Tests du calcul de reseau.
 *
 * Ecrits AVANT le code, a partir du calcul manuel de `reference.ts`. C'est le
 * seul module du projet ou cette inversion se justifie : les valeurs attendues
 * proviennent d'une resolution independante du programme, donc le test a
 * valeur de preuve et non de constat.
 */

import { describe, expect, it } from 'vitest'
import { calculerReseau } from '@/db/compute/cpm'
import { ATTENDU_REFERENCE, RESEAU_REFERENCE } from '@/db/compute/reference'
import { ErreurCycle, ErreurTacheInconnue, type Reseau } from '@/db/compute/types'

describe('cas de reference calcule a la main', () => {
  const r = calculerReseau(RESEAU_REFERENCE)

  it('retrouve la duree totale de 35 jours', () => {
    expect(r.dureeTotale).toBe(ATTENDU_REFERENCE.dureeTotale)
  })

  it('retrouve le chemin critique A-B-D-F-G-I-J', () => {
    expect(r.cheminCritique).toEqual([...ATTENDU_REFERENCE.cheminCritique])
  })

  for (const [id, attendu] of Object.entries(ATTENDU_REFERENCE.dates)) {
    it(`retrouve les dates et marges de la tache ${id}`, () => {
      const obtenu = r.dates.get(id)
      expect(obtenu).toBeDefined()
      expect(obtenu?.debutTot).toBe(attendu.debutTot)
      expect(obtenu?.finTot).toBe(attendu.finTot)
      expect(obtenu?.debutTard).toBe(attendu.debutTard)
      expect(obtenu?.finTard).toBe(attendu.finTard)
      expect(obtenu?.margeTotale).toBe(attendu.margeTotale)
      expect(obtenu?.margeLibre).toBe(attendu.margeLibre)
      expect(obtenu?.critique).toBe(attendu.margeTotale === 0)
    })
  }

  it('la somme des durees du chemin critique egale la duree totale', () => {
    const duree = r.cheminCritique
      .map((id) => RESEAU_REFERENCE.taches.find((t) => t.id === id)?.duree ?? 0)
      .reduce((a, b) => a + b, 0)
    expect(duree).toBe(r.dureeTotale)
  })

  it('aucune marge n est negative', () => {
    for (const d of r.dates.values()) {
      expect(d.margeTotale).toBeGreaterThanOrEqual(0)
      expect(d.margeLibre).toBeGreaterThanOrEqual(0)
    }
  })

  it('la marge libre ne depasse jamais la marge totale', () => {
    for (const d of r.dates.values()) {
      expect(d.margeLibre).toBeLessThanOrEqual(d.margeTotale)
    }
  })
})

describe('les quatre types de liaison', () => {
  /** A dure 10 jours et commence au jour 0, donc occupe les jours 0 a 9. */
  const avec = (type: 'FD' | 'DD' | 'FF' | 'DF', decalage: number): Reseau => ({
    taches: [
      { id: 'A', duree: 10 },
      { id: 'B', duree: 4 },
    ],
    liaisons: [{ amont: 'A', aval: 'B', type, decalage }],
  })

  it('fin-debut sans decalage : B demarre le lendemain de la fin de A', () => {
    const d = calculerReseau(avec('FD', 0)).dates.get('B')
    expect(d?.debutTot).toBe(10)
    expect(d?.finTot).toBe(13)
  })

  it('fin-debut avec decalage positif : temps de sechage de 3 jours', () => {
    expect(calculerReseau(avec('FD', 3)).dates.get('B')?.debutTot).toBe(13)
  })

  it('fin-debut avec decalage negatif : recouvrement de 4 jours', () => {
    expect(calculerReseau(avec('FD', -4)).dates.get('B')?.debutTot).toBe(6)
  })

  it('debut-debut sans decalage : B demarre en meme temps que A', () => {
    expect(calculerReseau(avec('DD', 0)).dates.get('B')?.debutTot).toBe(0)
  })

  it('debut-debut avec decalage : B demarre 6 jours apres le debut de A', () => {
    expect(calculerReseau(avec('DD', 6)).dates.get('B')?.debutTot).toBe(6)
  })

  it('fin-fin sans decalage : B finit en meme temps que A', () => {
    const d = calculerReseau(avec('FF', 0)).dates.get('B')
    expect(d?.finTot).toBe(9)
    expect(d?.debutTot).toBe(6)
  })

  it('fin-fin avec decalage : B finit 5 jours apres A', () => {
    expect(calculerReseau(avec('FF', 5)).dates.get('B')?.finTot).toBe(14)
  })

  it('debut-fin : B ne peut pas finir avant le debut de A plus le decalage', () => {
    expect(calculerReseau(avec('DF', 8)).dates.get('B')?.finTot).toBe(8)
  })

  it('une tache sans predecesseur demarre au jour 0', () => {
    expect(calculerReseau(avec('FD', 0)).dates.get('A')?.debutTot).toBe(0)
  })
})

describe('contraintes et cas limites', () => {
  it('respecte une contrainte de debut impose', () => {
    const r = calculerReseau({
      taches: [
        { id: 'A', duree: 5 },
        { id: 'B', duree: 3, debutImpose: 20 },
      ],
      liaisons: [{ amont: 'A', aval: 'B', type: 'FD', decalage: 0 }],
    })
    expect(r.dates.get('B')?.debutTot).toBe(20)
    expect(r.dureeTotale).toBe(23)
  })

  it('une contrainte de debut impose anterieure a la liaison est sans effet', () => {
    const r = calculerReseau({
      taches: [
        { id: 'A', duree: 5 },
        { id: 'B', duree: 3, debutImpose: 2 },
      ],
      liaisons: [{ amont: 'A', aval: 'B', type: 'FD', decalage: 0 }],
    })
    expect(r.dates.get('B')?.debutTot).toBe(5)
  })

  it('traite un reseau sans aucune liaison', () => {
    const r = calculerReseau({
      taches: [
        { id: 'A', duree: 5 },
        { id: 'B', duree: 12 },
      ],
      liaisons: [],
    })
    expect(r.dureeTotale).toBe(12)
    expect(r.dates.get('A')?.margeTotale).toBe(7)
    expect(r.dates.get('B')?.margeTotale).toBe(0)
    expect(r.cheminCritique).toEqual(['B'])
  })

  it('traite une tache unique', () => {
    const r = calculerReseau({ taches: [{ id: 'A', duree: 1 }], liaisons: [] })
    expect(r.dureeTotale).toBe(1)
    expect(r.dates.get('A')).toMatchObject({ debutTot: 0, finTot: 0, margeTotale: 0 })
  })

  it('traite un reseau vide', () => {
    const r = calculerReseau({ taches: [], liaisons: [] })
    expect(r.dureeTotale).toBe(0)
    expect(r.cheminCritique).toEqual([])
  })

  it('la marge libre de la derniere tache se mesure sur la fin du projet', () => {
    // B se termine au jour 11, le projet au jour 14 : B dispose de 3 jours.
    const r = calculerReseau({
      taches: [
        { id: 'A', duree: 15 },
        { id: 'B', duree: 12 },
      ],
      liaisons: [],
    })
    expect(r.dates.get('B')?.margeLibre).toBe(3)
  })
})

describe('detection de circuit', () => {
  it('refuse un circuit de deux taches et les nomme', () => {
    const reseau: Reseau = {
      taches: [
        { id: 'A', duree: 3 },
        { id: 'B', duree: 3 },
      ],
      liaisons: [
        { amont: 'A', aval: 'B', type: 'FD', decalage: 0 },
        { amont: 'B', aval: 'A', type: 'FD', decalage: 0 },
      ],
    }
    expect(() => calculerReseau(reseau)).toThrow(ErreurCycle)
    try {
      calculerReseau(reseau)
    } catch (e) {
      expect((e as ErreurCycle).taches.sort()).toEqual(['A', 'B'])
    }
  })

  it('refuse un circuit de trois taches', () => {
    expect(() =>
      calculerReseau({
        taches: [
          { id: 'A', duree: 1 },
          { id: 'B', duree: 1 },
          { id: 'C', duree: 1 },
        ],
        liaisons: [
          { amont: 'A', aval: 'B', type: 'FD', decalage: 0 },
          { amont: 'B', aval: 'C', type: 'FD', decalage: 0 },
          { amont: 'C', aval: 'A', type: 'FD', decalage: 0 },
        ],
      }),
    ).toThrow(ErreurCycle)
  })

  it('ne nomme que les taches du circuit, pas celles qui en dependent', () => {
    try {
      calculerReseau({
        taches: [
          { id: 'SAINE', duree: 1 },
          { id: 'A', duree: 1 },
          { id: 'B', duree: 1 },
          { id: 'AVAL', duree: 1 },
        ],
        liaisons: [
          { amont: 'A', aval: 'B', type: 'FD', decalage: 0 },
          { amont: 'B', aval: 'A', type: 'FD', decalage: 0 },
          { amont: 'B', aval: 'AVAL', type: 'FD', decalage: 0 },
        ],
      })
      expect.unreachable('le circuit aurait du etre detecte')
    } catch (e) {
      const impliquees = (e as ErreurCycle).taches
      expect(impliquees).toContain('A')
      expect(impliquees).toContain('B')
      expect(impliquees).not.toContain('SAINE')
    }
  })

  it('refuse une liaison vers une tache absente du reseau', () => {
    expect(() =>
      calculerReseau({
        taches: [{ id: 'A', duree: 1 }],
        liaisons: [{ amont: 'A', aval: 'FANTOME', type: 'FD', decalage: 0 }],
      }),
    ).toThrow(ErreurTacheInconnue)
  })

  it('refuse une duree nulle ou negative', () => {
    expect(() => calculerReseau({ taches: [{ id: 'A', duree: 0 }], liaisons: [] })).toThrow()
    expect(() => calculerReseau({ taches: [{ id: 'A', duree: -3 }], liaisons: [] })).toThrow()
  })

  it('refuse deux taches de meme identifiant', () => {
    expect(() =>
      calculerReseau({
        taches: [
          { id: 'A', duree: 1 },
          { id: 'A', duree: 2 },
        ],
        liaisons: [],
      }),
    ).toThrow()
  })
})
