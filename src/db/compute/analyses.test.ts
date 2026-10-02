import { describe, expect, it } from 'vitest'
import {
  arretsParCause,
  consommations,
  effectifs,
  familleDe,
  joursPerdusCumules,
  rendements,
  repartitionAleas,
  type LigneAnalyse,
  type ReleveAnalyse,
  type TacheAnalyse,
} from '@/db/compute/analyses'

const releve = (r: Partial<ReleveAnalyse> & { jour: number }): ReleveAnalyse => ({
  lotId: 'L',
  ouvriers: 0,
  journeeTravaillee: true,
  motifArret: null,
  ...r,
})

describe('effectifs', () => {
  it('somme les lots releves et les equipes affectees, puis prolonge la charge prevue', () => {
    const e = effectifs(
      [releve({ jour: 1, ouvriers: 8 }), releve({ jour: 1, lotId: 'M', ouvriers: 4 })],
      [
        { tacheId: 'a', ouvriers: 10, debut: 0, fin: 2 },
        { tacheId: 'b', ouvriers: 5, debut: 2, fin: 4 },
      ],
      2,
      2,
    )
    expect(e.map((p) => p.reel)).toEqual([0, 12, 0, null, null])
    expect(e.map((p) => p.prevu)).toEqual([10, 10, 15, 5, 5])
  })
})

describe('materiaux', () => {
  it('reconnait les trois familles par unite et designation', () => {
    expect(familleDe({ unite: 'M3', designation: 'Béton armé dosé à 350 pour voiles' })).toBe(
      'BETON',
    )
    expect(familleDe({ unite: 'M3', designation: 'Forme de pente en béton maigre' })).toBe('BETON')
    expect(familleDe({ unite: 'M3', designation: 'Fouille en pleine masse' })).toBeNull()
    expect(familleDe({ unite: 'KG', designation: 'Acier haute adhérence' })).toBe('ACIER')
    expect(familleDe({ unite: 'KG', designation: 'Charpente métallique galvanisée' })).toBeNull()
    expect(familleDe({ unite: 'M2', designation: 'Coffrage de poteaux' })).toBe('COFFRAGE')
    // Un treillis soude est de l'acier, mais compte en surface : hors famille.
    expect(familleDe({ unite: 'M2', designation: 'Treillis soudé ST 25' })).toBeNull()
  })

  it('cumule le realise et suit le prevu lineaire, acier converti en tonnes', () => {
    const lignes: LigneAnalyse[] = [
      {
        id: 'b',
        tacheId: 't',
        designation: 'Béton armé',
        unite: 'M3',
        quantitePrevue: 40,
        prixUnitaireXof: 1,
      },
      {
        id: 'a',
        tacheId: 't',
        designation: 'Acier HA',
        unite: 'KG',
        quantitePrevue: 4000,
        prixUnitaireXof: 1,
      },
    ]
    const taches: TacheAnalyse[] = [
      { id: 't', lotId: 'L', nature: 'BETONNAGE', debut: 1, duree: 4 },
    ]
    const c = consommations(
      lignes,
      taches,
      [
        { ligneId: 'b', jour: 1, quantite: 5 },
        { ligneId: 'b', jour: 3, quantite: 10 },
        { ligneId: 'a', jour: 2, quantite: 1500 },
      ],
      3,
    )
    const beton = c.find((x) => x.famille === 'BETON')!
    expect(beton.total).toBe(40)
    expect(beton.serie.map((p) => p.realise)).toEqual([0, 5, 5, 15])
    expect(beton.serie.map((p) => p.prevu)).toEqual([0, 10, 20, 30])
    const acier = c.find((x) => x.famille === 'ACIER')!
    expect(acier.total).toBe(4)
    expect(acier.serie[3]).toEqual({ jour: 3, prevu: 3, realise: 1.5 })
    expect(c.find((x) => x.famille === 'COFFRAGE')!.total).toBe(0)
  })
})

describe('rendements', () => {
  // Deux taches du meme lot : A, equipe de 6, et B, equipe de 2.
  const taches: TacheAnalyse[] = [
    { id: 'A', lotId: 'L', nature: 'BETONNAGE', debut: 0, duree: 10 },
    { id: 'B', lotId: 'L', nature: 'MACONNERIE', debut: 0, duree: 10 },
  ]
  const lignes: LigneAnalyse[] = [
    {
      id: 'a',
      tacheId: 'A',
      designation: 'Béton',
      unite: 'M3',
      quantitePrevue: 60,
      prixUnitaireXof: 100,
    },
    {
      id: 'b',
      tacheId: 'B',
      designation: 'Agglos',
      unite: 'M2',
      quantitePrevue: 40,
      prixUnitaireXof: 50,
    },
  ]
  const equipes = [
    { tacheId: 'A', ouvriers: 6, debut: 0, fin: 9 },
    { tacheId: 'B', ouvriers: 2, debut: 0, fin: 9 },
  ]

  it('repartit l effectif du lot au prorata des equipes prevues', () => {
    // Prevu : A produit 6 m3 par jour avec 6 ouvriers, 1 m3 par ouvrier-jour.
    // Jour 0 : 8 ouvriers releves, 6 pour A, 2 pour B ; A produit 3 m3.
    const r = rendements(
      lignes,
      taches,
      equipes,
      [releve({ jour: 0, ouvriers: 8 })],
      [
        { ligneId: 'a', jour: 0, quantite: 3 },
        { ligneId: 'b', jour: 0, quantite: 4 },
      ],
      0,
    )
    const a = r.find((x) => x.nature === 'BETONNAGE')!
    expect(a.ouvriersJours).toBe(6)
    expect(a.quantiteParOuvrierJour).toBeCloseTo(0.5, 12)
    expect(a.quantitePrevueParOuvrierJour).toBeCloseTo(1, 12)
    expect(a.indice).toBeCloseTo(0.5, 12)
    const b = r.find((x) => x.nature === 'MACONNERIE')!
    expect(b.ouvriersJours).toBe(2)
    // Prevu : 40 m2 en 20 ouvriers-jours, 2 par ouvrier-jour ; constate 2.
    expect(b.indice).toBeCloseTo(1, 12)
  })

  it('n attribue pas une journee de lot sans production', () => {
    const r = rendements(lignes, taches, equipes, [releve({ jour: 0, ouvriers: 8 })], [], 0)
    expect(r).toEqual([])
  })

  it('distingue la fenetre recente du cumul', () => {
    const r = rendements(
      lignes,
      taches,
      [{ tacheId: 'A', ouvriers: 6, debut: 0, fin: 99 }],
      [releve({ jour: 0, ouvriers: 6 }), releve({ jour: 50, ouvriers: 6 })],
      [
        { ligneId: 'a', jour: 0, quantite: 12 },
        { ligneId: 'a', jour: 50, quantite: 3 },
      ],
      50,
    )
    const a = r.find((x) => x.nature === 'BETONNAGE')!
    // Prevu : 6 000 F sur 600 ouvriers-jours, 10 F par ouvrier-jour.
    expect(a.indice).toBeCloseTo(1500 / 12 / 10, 12)
    expect(a.indiceRecent).toBeCloseTo(300 / 6 / 10, 12)
  })
})

describe('aleas et arrets', () => {
  const aleas = [
    { jour: 2, type: 'INTEMPERIE', gravite: 1, impactDelaiJ: 1 },
    { jour: 5, type: 'INTEMPERIE', gravite: 3, impactDelaiJ: 2 },
    { jour: 5, type: 'PANNE_ENGIN', gravite: 3, impactDelaiJ: 4 },
    { jour: 9, type: 'INCIDENT', gravite: 2, impactDelaiJ: 7 },
  ]

  it('repartit par type et par gravite jusqu a la date d analyse', () => {
    const r = repartitionAleas(aleas, 6)
    expect(r).toEqual([
      { type: 'INTEMPERIE', total: 2, parGravite: [1, 0, 1, 0], joursPerdus: 3 },
      { type: 'PANNE_ENGIN', total: 1, parGravite: [0, 0, 1, 0], joursPerdus: 4 },
    ])
  })

  it('cumule les jours perdus', () => {
    expect(joursPerdusCumules(aleas, 6).map((p) => p.cumul)).toEqual([0, 0, 1, 1, 1, 7, 7])
  })

  it('compte les journees et les journees de lot non travaillees par cause', () => {
    const r = arretsParCause(
      [
        releve({ jour: 1, journeeTravaillee: false, motifArret: 'Pluie' }),
        releve({ jour: 1, lotId: 'M', journeeTravaillee: false, motifArret: 'Pluie' }),
        releve({ jour: 3, journeeTravaillee: false, motifArret: 'Pluie ' }),
        releve({ jour: 4, journeeTravaillee: false, motifArret: null }),
        releve({ jour: 4, ouvriers: 5 }),
      ],
      10,
    )
    expect(r).toEqual([
      { cause: 'Pluie', journees: 2, journeesLot: 3 },
      { cause: 'Cause non précisée', journees: 1, journeesLot: 1 },
    ])
  })
})
