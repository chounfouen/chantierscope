import { describe, expect, it } from 'vitest'
import { dansPeriode, faitsMarquants, semaineFinissantLe } from '@/db/compute/rapport'

const P = semaineFinissantLe('2026-09-27')

describe('periode', () => {
  it('couvre sept jours, bornes incluses', () => {
    expect(P).toEqual({ debut: '2026-09-21', fin: '2026-09-27' })
    expect(dansPeriode('2026-09-21', P)).toBe(true)
    expect(dansPeriode('2026-09-20', P)).toBe(false)
    expect(dansPeriode(null, P)).toBe(false)
  })
})

describe('faits marquants', () => {
  const base = {
    periode: P,
    taches: [],
    jalonsAtteints: [],
    aleas: [],
    avancementDebut: 0.41,
    avancementFin: 0.4364,
    avancementPrevuFin: 0.4823,
    journeesNonTravaillees: 0,
  }

  it('ouvre sur le mouvement de l avancement et l ecart au planning', () => {
    const f = faitsMarquants(base)
    expect(f[0]).toBe(
      'L’avancement passe de 41,0 % à 43,6 %, soit +2,6 points sur la semaine ; 4,6 points de retard sur le planning.',
    )
    expect(f).toContain('Aucun aléa déclaré sur la période.')
  })

  it('cite les jalons, les taches achevees et commencees de la periode, et elles seules', () => {
    const f = faitsMarquants({
      ...base,
      taches: [
        {
          codeWbs: '04.3.2',
          nom: 'Voiles du R+2',
          debutReel: '2026-09-01',
          finReelle: '2026-09-25',
        },
        { codeWbs: '04.4.1', nom: 'Poteaux du R+3', debutReel: '2026-09-22', finReelle: null },
        {
          codeWbs: '03.1.1',
          nom: 'Béton de propreté',
          debutReel: '2026-03-20',
          finReelle: '2026-03-25',
        },
      ],
      jalonsAtteints: [
        {
          nom: 'Achèvement des fondations',
          dateReelle: '2026-09-24',
          datePrevue: '2026-09-17',
          contractuel: true,
        },
      ],
      aleas: [{ gravite: 1 }, { gravite: 3 }],
      journeesNonTravaillees: 2,
    })
    expect(f).toContain(
      'Jalon contractuel atteint : Achèvement des fondations, 7 jours après la date prévue.',
    )
    expect(f).toContain('1 tâche achevée : 04.3.2 Voiles du R+2.')
    expect(f).toContain('1 tâche commencée : 04.4.1 Poteaux du R+3.')
    expect(f).toContain('2 aléas déclarés, dont 1 majeur ou bloquant.')
    expect(f).toContain('2 journées non travaillées sur au moins un lot.')
    expect(f.join(' ')).not.toContain('Béton de propreté')
  })
})
