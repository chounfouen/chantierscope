import { describe, expect, it } from 'vitest'
import { estOuvrable, ferie, feriesEntre, joursOuvrables, paques } from '@/db/compute/calendrier'

describe('calcul de la date de Paques', () => {
  // Dates verifiables dans n importe quel almanach.
  const connues: [number, string][] = [
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
    [2000, '2000-04-23'],
  ]
  for (const [annee, attendu] of connues) {
    it(`Paques ${annee} tombe le ${attendu}`, () => {
      expect(paques(annee)).toBe(attendu)
    })
  }
})

describe('jours feries ivoiriens', () => {
  it('reconnait la fete nationale du 7 aout', () => {
    expect(ferie('2026-08-07')?.nom).toBe('Fete nationale')
  })

  it('reconnait la journee nationale de la paix du 15 novembre', () => {
    expect(ferie('2026-11-15')?.nom).toBe('Journee nationale de la paix')
  })

  it('deduit le lundi de Paques du dimanche de Paques', () => {
    expect(ferie('2026-04-06')?.nom).toBe('Lundi de Paques')
  })

  it('deduit l Ascension, trente-neuf jours apres Paques', () => {
    expect(ferie('2026-05-14')?.nom).toBe('Ascension')
  })

  it('marque les fetes musulmanes comme estimees', () => {
    const f = ferie('2026-03-20')
    expect(f?.nom).toBe('Aid el-Fitr')
    expect(f?.estimee).toBe(true)
  })

  it('ne marque pas les fetes a date fixe comme estimees', () => {
    expect(ferie('2026-12-25')?.estimee).toBe(false)
  })

  it('une date ordinaire n est pas feriee', () => {
    expect(ferie('2026-09-30')).toBeNull()
  })
})

describe('jours ouvrables', () => {
  it('le dimanche n est pas ouvrable', () => {
    expect(estOuvrable('2026-03-01')).toBe(false) // dimanche
  })

  it('le samedi est ouvrable par defaut sur un chantier ivoirien', () => {
    expect(estOuvrable('2026-03-07')).toBe(true) // samedi
  })

  it('le samedi peut etre declare chome', () => {
    expect(estOuvrable('2026-03-07', { joursRepos: [0, 6] })).toBe(false)
  })

  it('un jour ferie n est pas ouvrable', () => {
    expect(estOuvrable('2026-08-07')).toBe(false)
  })

  it('les feries peuvent etre ignores', () => {
    expect(estOuvrable('2026-08-07', { feries: false })).toBe(true)
  })

  it('compte les jours ouvrables d une semaine complete', () => {
    // Du lundi 2 au dimanche 8 mars 2026 : six jours ouvrables, hors ferie.
    expect(joursOuvrables('2026-03-02', '2026-03-08')).toBe(6)
  })

  it('un seul jour ouvrable se compte un', () => {
    expect(joursOuvrables('2026-03-02', '2026-03-02')).toBe(1)
  })

  it('une periode reduite a un dimanche ne compte aucun jour', () => {
    expect(joursOuvrables('2026-03-01', '2026-03-01')).toBe(0)
  })

  it('le jour de la semaine ne depend pas du fuseau du systeme', () => {
    // Un calcul en heure locale plutot qu en UTC ferait basculer cette date
    // d un jour dans les fuseaux negatifs.
    expect(estOuvrable('2026-03-01')).toBe(false)
    expect(estOuvrable('2026-03-02')).toBe(true)
  })
})

describe('feries sur la duree du chantier', () => {
  const liste = feriesEntre('2026-03-02', '2027-04-17')

  it('couvre les deux annees du chantier', () => {
    expect(liste.some((f) => f.date.startsWith('2026'))).toBe(true)
    expect(liste.some((f) => f.date.startsWith('2027'))).toBe(true)
  })

  it('est triee par date', () => {
    const dates = liste.map((f) => f.date)
    expect(dates).toEqual([...dates].sort())
  })

  it('exclut les dates hors periode', () => {
    expect(liste.every((f) => f.date >= '2026-03-02' && f.date <= '2027-04-17')).toBe(true)
  })

  it('compte une dizaine de feries par an', () => {
    expect(liste.length).toBeGreaterThanOrEqual(14)
    expect(liste.length).toBeLessThanOrEqual(30)
  })
})
