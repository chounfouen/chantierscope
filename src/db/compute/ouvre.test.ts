import { describe, expect, it } from 'vitest'
import { avancementPrevu } from '@/db/compute/avancement'
import { calculerReseau } from '@/db/compute/cpm'
import { calendrierDe, calendrierDepuis, etaler, etalerAvant } from '@/db/compute/ouvre'
import { courbePlanifiee, projeterReseau } from '@/db/compute/tableau'

/** Semaine de six jours : le jour 6, puis tous les sept jours, est chome. */
const semaine = calendrierDe((j) => ((j % 7) + 7) % 7 !== 6)

describe('calendrier de travail', () => {
  it('etale une tache ouvree en sautant le jour de repos', () => {
    expect(etaler(semaine, 0, 6)).toEqual({ debut: 0, fin: 5 })
    expect(etaler(semaine, 0, 7)).toEqual({ debut: 0, fin: 7 })
    // Un debut tombant un jour chome est porte au lendemain.
    expect(etaler(semaine, 6, 1)).toEqual({ debut: 7, fin: 7 })
    expect(etalerAvant(semaine, 7, 7)).toEqual({ debut: 0, fin: 7 })
    expect(semaine.compter(0, 13)).toBe(12)
  })

  it('suit le calendrier ivoirien : dimanches et feries', () => {
    // Ordre de service le lundi 2 mars 2026.
    const c = calendrierDepuis('2026-03-02')
    expect(c.ouvrable(0)).toBe(true)
    expect(c.ouvrable(6)).toBe(false) // dimanche 8 mars
    // Lundi de Paques, 6 avril 2026 : jour 35.
    expect(c.ouvrable(35)).toBe(false)
  })
})

describe('reseau en jours ouvres', () => {
  const reseau = {
    calendrier: semaine,
    taches: [
      { id: 'A', duree: 7, ouvre: true },
      { id: 'B', duree: 2, ouvre: true },
      // Sechage : delai technologique, en jours calendaires.
      { id: 'C', duree: 3 },
    ],
    liaisons: [
      { amont: 'A', aval: 'B', type: 'FD' as const, decalage: 0 },
      { amont: 'A', aval: 'C', type: 'FD' as const, decalage: 2 },
    ],
  }

  it('place les taches ouvrees sur les seuls jours ouvrables', () => {
    const r = calculerReseau(reseau)
    expect(r.dates.get('A')).toMatchObject({ debutTot: 0, finTot: 7 })
    expect(r.dates.get('B')).toMatchObject({ debutTot: 8, finTot: 9 })
    // Le decalage d'une liaison reste calendaire.
    expect(r.dates.get('C')).toMatchObject({ debutTot: 10, finTot: 12 })
    expect(r.dureeTotale).toBe(13)
  })

  it('le chemin critique ne porte aucune marge, les autres en portent', () => {
    const r = calculerReseau(reseau)
    expect(r.cheminCritique).toEqual(['A', 'C'])
    expect(r.dates.get('B')?.margeTotale).toBe(3)
    expect(r.dates.get('A')?.margeTotale).toBe(0)
  })

  it('sans calendrier, les memes durees se lisent en jours calendaires', () => {
    const r = calculerReseau({ ...reseau, calendrier: undefined })
    expect(r.dates.get('A')).toMatchObject({ debutTot: 0, finTot: 6 })
  })

  it('une liaison fin-fin vers une tache ouvree la cale sur un jour ouvrable', () => {
    const r = calculerReseau({
      calendrier: semaine,
      taches: [
        { id: 'X', duree: 6 },
        { id: 'Y', duree: 2, ouvre: true },
      ],
      liaisons: [{ amont: 'X', aval: 'Y', type: 'FF' as const, decalage: 1 }],
    })
    // X finit le jour 5 ; Y doit finir le jour 6 au plus tot, qui est chome.
    expect(r.dates.get('Y')).toMatchObject({ debutTot: 5, finTot: 7 })
  })
})

describe('valeur planifiee et projection en jours ouvres', () => {
  it('ne fait pas avancer une tache ouvree le jour de repos', () => {
    const t = { debut: 0, duree: 12, ouvre: true }
    // Six jours ouvrables sur les sept premiers : la moitie.
    expect(avancementPrevu(t, 5, semaine)).toBeCloseTo(0.5)
    expect(avancementPrevu(t, 6, semaine)).toBeCloseTo(0.5)
    expect(avancementPrevu(t, 13, semaine)).toBe(1)
    // Sans calendrier, ou en jours calendaires, la lecture lineaire.
    expect(avancementPrevu(t, 6)).toBeCloseTo(7 / 12)
    expect(avancementPrevu({ debut: 0, duree: 14 }, 6, semaine)).toBeCloseTo(0.5)
  })

  it('prolonge la courbe planifiee jusqu a la fin etalee', () => {
    const courbe = courbePlanifiee([{ debut: 0, duree: 12, budget: 1200, ouvre: true }], semaine)
    // Douze jours ouvrables, de 0 a 5 et de 7 a 12.
    expect(courbe).toHaveLength(13)
    expect(courbe[6]).toBe(courbe[5])
    expect(courbe.at(-1)).toBe(1200)
  })

  it('rejoue le reste d une tache ouvree en journees de travail', () => {
    const suivie = {
      id: 'A',
      codeWbs: '01',
      nom: 'A',
      debut: 0,
      duree: 12,
      ouvre: true,
      debutImpose: null,
      debutReel: 0,
      finReelle: null,
      avancement: 0.5,
      critique: true,
    }
    // A la date d'etat du jour 5, six jours de travail restent : 7 a 12.
    expect(projeterReseau([suivie], [], 5, semaine).get('A')).toBe(12)
    // Sans calendrier, six jours calendaires : 6 a 11.
    expect(projeterReseau([suivie], [], 5).get('A')).toBe(11)
  })
})
