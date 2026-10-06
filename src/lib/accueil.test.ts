import { describe, expect, it } from 'vitest'
import { prenom, salutation, sousTitreSituation, titreSituation } from '@/lib/accueil'

const base = { ecartDelaiJ: 0, jalonsMenaces: 0, alertesCritiques: 0, avancement: 0.4 }

describe('accueil', () => {
  it('salue selon l heure', () => {
    expect(salutation(8)).toBe('Bonjour')
    expect(salutation(17)).toBe('Bonjour')
    expect(salutation(18)).toBe('Bonsoir')
    expect(salutation(2)).toBe('Bonsoir')
  })

  it('garde le prenom', () => {
    expect(prenom('Yao N’Guessan')).toBe('Yao')
    expect(prenom('  Adjoua  Konan ')).toBe('Adjoua')
  })

  it('dit la situation en une phrase, selon le retard', () => {
    expect(titreSituation(base)).toBe('Le chantier avance au rythme prévu.')
    expect(titreSituation({ ...base, ecartDelaiJ: 1.2 })).toBe(
      'Le chantier avance, avec 1 jour de retard rattrapable.',
    )
    expect(titreSituation({ ...base, ecartDelaiJ: 16.7 })).toBe(
      'Le chantier avance, mais accuse 17 jours de retard.',
    )
    expect(titreSituation({ ...base, avancement: 1 })).toBe('Le chantier est achevé.')
  })

  it('nomme ce qui demande l attention', () => {
    expect(sousTitreSituation(base)).toBe('Rien d’urgent : aucune alerte critique à cette date.')
    expect(sousTitreSituation({ ...base, jalonsMenaces: 3, alertesCritiques: 6 })).toBe(
      '3 jalons contractuels menacés et 6 points critiques à traiter.',
    )
    expect(sousTitreSituation({ ...base, alertesCritiques: 1 })).toBe('1 point critique à traiter.')
  })
})
