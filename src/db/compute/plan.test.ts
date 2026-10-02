import { describe, expect, it } from 'vitest'
import { etatZone, joursEchantillonnes, rejouerZones, type TachePlan } from '@/db/compute/plan'

const tache = (id: string, budget: number, o: Partial<TachePlan> = {}): TachePlan => ({
  id,
  methode: 'UNITES_PHYSIQUES',
  debut: 0,
  duree: 10,
  critique: false,
  lignes: [
    { id: `l-${id}`, quantitePrevue: 10, quantiteRealisee: 0, prixUnitaireXof: budget / 10 },
  ],
  ...o,
})

describe('etat d une zone', () => {
  it('distingue les cinq etats', () => {
    expect(etatZone(1, 1, true)).toBe('ACHEVE')
    expect(etatZone(0, 0, false)).toBe('NON_COMMENCE')
    expect(etatZone(0.5, 0.51, false)).toBe('EN_COURS')
    expect(etatZone(0.4, 0.5, false)).toBe('EN_RETARD')
    expect(etatZone(0.4, 0.5, true)).toBe('CRITIQUE')
    expect(etatZone(0, 0.3, false)).toBe('EN_RETARD')
  })
})

describe('rejeu des zones', () => {
  it('pondere par le budget et rejoue jour par jour', () => {
    // Plancher 3 000, maconnerie 1 000 ; le plancher est fait a moitie au jour 4.
    const taches = [tache('plancher', 3000), tache('maconnerie', 1000, { debut: 10 })]
    const zones = [{ id: 'z', tacheIds: ['plancher', 'maconnerie'] }]
    const r = rejouerZones(
      zones,
      taches,
      [
        { ligneId: 'l-plancher', jour: 2, quantite: 2 },
        { ligneId: 'l-plancher', jour: 4, quantite: 3 },
      ],
      [0, 4, 9],
    )
    expect(r.map((m) => m.get('z')?.reel)).toEqual([0, 0.375, 0.375])
    // Prevu au jour 4 : plancher a 50 %, maconnerie pas commencee.
    expect(r[1]?.get('z')?.prevu).toBeCloseTo(0.375, 12)
    expect(r[1]?.get('z')?.etat).toBe('EN_COURS')
    // Jour 9 : plancher prevu acheve, 75 % prevus pour la zone.
    expect(r[2]?.get('z')?.etat).toBe('EN_RETARD')
  })

  it('n est critique que si une tache critique est elle-meme en retard', () => {
    const zones = [{ id: 'z', tacheIds: ['critique-a-l-heure', 'a-marge-en-retard'] }]
    const avant = [
      tache('critique-a-l-heure', 1000, { critique: true, debut: 20 }),
      tache('a-marge-en-retard', 1000),
    ]
    expect(rejouerZones(zones, avant, [], [9])[0]?.get('z')?.etat).toBe('EN_RETARD')
    const apres = [tache('critique-en-retard', 1000, { critique: true })]
    expect(
      rejouerZones([{ id: 'z', tacheIds: ['critique-en-retard'] }], apres, [], [9])[0]?.get('z')
        ?.etat,
    ).toBe('CRITIQUE')
  })

  it('n altere pas les taches fournies', () => {
    const t = tache('a', 100)
    rejouerZones(
      [{ id: 'z', tacheIds: ['a'] }],
      [t],
      [{ ligneId: 'l-a', jour: 0, quantite: 5 }],
      [0],
    )
    expect(t.lignes[0]?.quantiteRealisee).toBe(0)
  })

  it('echantillonne chaque semaine jusqu a la date d analyse comprise', () => {
    expect(joursEchantillonnes(15)).toEqual([1, 8, 15])
  })
})
