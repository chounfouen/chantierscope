import { describe, expect, it } from 'vitest'
import {
  agreger,
  avancementPrevu,
  avancementTache,
  ponderationParDuree,
} from '@/db/compute/avancement'
import type { TacheAvancement } from '@/db/compute/types'

const ligne = (prevue: number, realisee: number, pu: number) => ({
  quantitePrevue: prevue,
  quantiteRealisee: realisee,
  prixUnitaireXof: pu,
})

const tache = (p: Partial<TacheAvancement> = {}): TacheAvancement => ({
  id: 'T',
  methode: 'UNITES_PHYSIQUES',
  lignes: [ligne(100, 0, 1000)],
  debut: 0,
  duree: 10,
  ...p,
})

describe('methode des unites physiques', () => {
  it('une tache non entamee est a zero', () => {
    expect(avancementTache(tache(), 0).avancement).toBe(0)
  })

  it('une tache achevee est a cent pour cent', () => {
    expect(avancementTache(tache({ lignes: [ligne(100, 100, 1000)] }), 0).avancement).toBe(1)
  })

  it('une seule ligne : l avancement est le rapport des quantites', () => {
    expect(avancementTache(tache({ lignes: [ligne(200, 50, 1000)] }), 0).avancement).toBe(0.25)
  })

  it('plusieurs lignes : la ponderation se fait par la VALEUR, pas par la quantite', () => {
    // 10 m3 de beton a 110 000, soit 1 100 000 F, realises a moitie.
    // 500 kg d acier a 900, soit 450 000 F, non entames.
    // Ponderation par la valeur : 550 000 / 1 550 000 = 0,354...
    // Une moyenne des taux de chaque ligne donnerait 0,25, ce qui est faux.
    const r = avancementTache(tache({ lignes: [ligne(10, 5, 110_000), ligne(500, 0, 900)] }), 0)
    expect(r.budget).toBe(1_550_000)
    expect(r.avancement).toBeCloseTo(550_000 / 1_550_000, 10)
    expect(r.valeurAcquise).toBe(550_000)
  })

  it('un depassement de quantite ne fait pas monter l avancement au-dessus de cent', () => {
    const r = avancementTache(tache({ lignes: [ligne(100, 130, 1000)] }), 0)
    expect(r.avancement).toBe(1)
    expect(r.valeurAcquise).toBe(100_000)
  })

  it('un depassement de quantite est chiffre a part, en FCFA', () => {
    const r = avancementTache(tache({ lignes: [ligne(100, 130, 1000)] }), 0)
    expect(r.depassementXof).toBe(30_000)
  })

  it('un depassement sur une ligne n efface pas le retard d une autre', () => {
    // Premiere ligne depassee de 20, seconde ligne a zero.
    const r = avancementTache(tache({ lignes: [ligne(100, 120, 1000), ligne(100, 0, 1000)] }), 0)
    expect(r.avancement).toBe(0.5)
    expect(r.depassementXof).toBe(20_000)
  })

  it('une tache sans ligne de quantitatif est a zero et de budget nul', () => {
    const r = avancementTache(tache({ lignes: [] }), 0)
    expect(r.avancement).toBe(0)
    expect(r.budget).toBe(0)
    expect(r.valeurAcquise).toBe(0)
  })

  it('une ligne de prix unitaire nul ne pese rien dans la ponderation', () => {
    const r = avancementTache(tache({ lignes: [ligne(100, 100, 1000), ligne(100, 0, 0)] }), 0)
    expect(r.avancement).toBe(1)
  })
})

describe('methode des jalons ponderes', () => {
  const t = (lignes: ReturnType<typeof ligne>[]) =>
    avancementTache(tache({ methode: 'JALONS_PONDERES', lignes }), 0)

  it('une ligne entamee mais non achevee ne compte pas', () => {
    expect(t([ligne(100, 99, 1000)]).avancement).toBe(0)
  })

  it('une ligne achevee compte pour toute sa valeur', () => {
    expect(t([ligne(100, 100, 1000)]).avancement).toBe(1)
  })

  it('les paliers sont ponderes par leur valeur, non comptes a l unite', () => {
    // Palier a 900 000 F acheve, palier a 100 000 F non acheve.
    // Ponderation par la valeur : 0,9. Un comptage a l unite donnerait 0,5.
    const r = t([ligne(1, 1, 900_000), ligne(1, 0, 100_000)])
    expect(r.avancement).toBe(0.9)
  })
})

describe('methode de la proportion de duree', () => {
  const t = (jour: number) =>
    avancementTache(
      tache({
        methode: 'PROPORTION_DUREE',
        debut: 10,
        duree: 20,
        lignes: [ligne(1, 0, 5_000_000)],
      }),
      jour,
    )

  it('avant le debut, l avancement est nul', () => {
    expect(t(9).avancement).toBe(0)
  })

  it('le premier jour, une journee sur vingt est faite', () => {
    expect(t(10).avancement).toBeCloseTo(0.05, 10)
  })

  it('a mi-parcours, la moitie est faite', () => {
    expect(t(19).avancement).toBeCloseTo(0.5, 10)
  })

  it('le dernier jour, la tache est achevee', () => {
    expect(t(29).avancement).toBe(1)
  })

  it('apres la fin, l avancement reste a cent pour cent', () => {
    expect(t(200).avancement).toBe(1)
  })
})

describe('methode tout ou rien', () => {
  const t = (lignes: ReturnType<typeof ligne>[]) =>
    avancementTache(tache({ methode: 'ZERO_CENT', lignes }), 0)

  it('reste a zero tant qu une seule ligne est incomplete', () => {
    expect(t([ligne(100, 100, 1000), ligne(50, 49, 1000)]).avancement).toBe(0)
  })

  it('passe a cent quand toutes les lignes sont achevees', () => {
    expect(t([ligne(100, 100, 1000), ligne(50, 50, 1000)]).avancement).toBe(1)
  })
})

describe('agregation ponderee par le budget', () => {
  it('agrege deux taches de meme budget', () => {
    const r = agreger([
      { avancement: 1, budget: 1_000_000, valeurAcquise: 1_000_000, depassementXof: 0 },
      { avancement: 0, budget: 1_000_000, valeurAcquise: 0, depassementXof: 0 },
    ])
    expect(r.avancement).toBe(0.5)
    expect(r.budget).toBe(2_000_000)
    expect(r.valeurAcquise).toBe(1_000_000)
  })

  it('cumule les depassements', () => {
    const r = agreger([
      { avancement: 1, budget: 100, valeurAcquise: 100, depassementXof: 40 },
      { avancement: 1, budget: 100, valeurAcquise: 100, depassementXof: 60 },
    ])
    expect(r.depassementXof).toBe(100)
  })

  it('un ensemble de budget nul est a zero, sans division par zero', () => {
    const r = agreger([{ avancement: 0, budget: 0, valeurAcquise: 0, depassementXof: 0 }])
    expect(r.avancement).toBe(0)
    expect(Number.isFinite(r.avancement)).toBe(true)
  })

  it('agrege une liste vide sans erreur', () => {
    expect(agreger([]).avancement).toBe(0)
  })
})

/**
 * Contre-exemple destine au memoire.
 *
 * Il demontre chiffres en main pourquoi l'avancement doit etre pondere par le
 * budget et non par la duree, comme le font la plupart des outils grand
 * public. Voir la section 4.2 de `docs/CONCEPTION.md`.
 */
describe('contre-exemple : ponderation budgetaire contre ponderation par duree', () => {
  // Deux taches de MEME DUREE, dix jours chacune, mais de poids tres
  // differents dans le marche.
  const installation = {
    avancement: 1,
    budget: 12_000_000,
    valeurAcquise: 12_000_000,
    depassementXof: 0,
  }
  const grosOeuvre = {
    avancement: 0,
    budget: 108_000_000,
    valeurAcquise: 0,
    depassementXof: 0,
  }

  it('la ponderation par la duree annonce cinquante pour cent', () => {
    expect(
      ponderationParDuree([
        { avancement: 1, duree: 10 },
        { avancement: 0, duree: 10 },
      ]),
    ).toBe(0.5)
  })

  it('la ponderation par le budget annonce dix pour cent', () => {
    expect(agreger([installation, grosOeuvre]).avancement).toBeCloseTo(0.1, 10)
  })

  it('l ecart entre les deux methodes atteint quarante points', () => {
    const parDuree = ponderationParDuree([
      { avancement: 1, duree: 10 },
      { avancement: 0, duree: 10 },
    ])
    const parBudget = agreger([installation, grosOeuvre]).avancement
    expect(parDuree - parBudget).toBeCloseTo(0.4, 10)
  })

  it('seule la ponderation budgetaire est coherente avec la valeur acquise', () => {
    const r = agreger([installation, grosOeuvre])
    // La valeur acquise est un fait comptable : douze millions sur cent vingt.
    expect(r.valeurAcquise).toBe(12_000_000)
    expect(r.valeurAcquise).toBe(r.avancement * r.budget)
    // La ponderation par la duree annoncerait une valeur acquise de soixante
    // millions, soit cinq fois la realite.
    const parDuree = 0.5
    expect(parDuree * r.budget).toBe(60_000_000)
  })
})

describe('avancement planifie a une date', () => {
  it('est nul avant le debut', () => {
    expect(avancementPrevu({ debut: 10, duree: 20 }, 5)).toBe(0)
  })

  it('progresse lineairement dans la tache', () => {
    expect(avancementPrevu({ debut: 10, duree: 20 }, 19)).toBeCloseTo(0.5, 10)
  })

  it('vaut un a partir du dernier jour', () => {
    expect(avancementPrevu({ debut: 10, duree: 20 }, 29)).toBe(1)
    expect(avancementPrevu({ debut: 10, duree: 20 }, 99)).toBe(1)
  })

  it('une tache d un jour est achevee le jour meme', () => {
    expect(avancementPrevu({ debut: 4, duree: 1 }, 4)).toBe(1)
    expect(avancementPrevu({ debut: 4, duree: 1 }, 3)).toBe(0)
  })
})

describe('cas degeneres des methodes', () => {
  it('les jalons ponderes ne divisent pas par zero sur un budget nul', () => {
    const r = avancementTache(tache({ methode: 'JALONS_PONDERES', lignes: [ligne(1, 1, 0)] }), 0)
    expect(r.avancement).toBe(0)
    expect(Number.isFinite(r.avancement)).toBe(true)
  })

  it('les jalons ponderes sur une tache sans ligne restent a zero', () => {
    expect(avancementTache(tache({ methode: 'JALONS_PONDERES', lignes: [] }), 0).avancement).toBe(0)
  })

  it('le tout ou rien sur une tache sans ligne reste a zero', () => {
    // Sans ligne de quantitatif, il n y a rien a achever : la tache ne peut
    // pas etre declaree terminee par vacuite.
    expect(avancementTache(tache({ methode: 'ZERO_CENT', lignes: [] }), 0).avancement).toBe(0)
  })

  it('la proportion de duree traite une duree nulle comme un achevement', () => {
    expect(avancementPrevu({ debut: 0, duree: 0 }, 0)).toBe(1)
  })

  it('une quantite prevue nulle ne fait pas exploser le rapport', () => {
    const r = avancementTache(tache({ lignes: [ligne(0, 0, 1000)] }), 0)
    expect(Number.isFinite(r.avancement)).toBe(true)
    expect(r.avancement).toBe(0)
  })
})
