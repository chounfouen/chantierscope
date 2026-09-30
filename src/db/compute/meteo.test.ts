import { describe, expect, it } from 'vitest'
import { causeArret, naturesBloquees, SEUILS, type ReleveMeteo } from '@/db/compute/meteo'

const beau: ReleveMeteo = {
  code: 0,
  temperatureMaxC: 31,
  temperatureMinC: 24,
  precipitationsMm: 0,
  rafalesKmh: 18,
}

const avec = (p: Partial<ReleveMeteo>): ReleveMeteo => ({ ...beau, ...p })

describe('journee sans intemperie', () => {
  it('ne bloque aucune nature', () => {
    expect(naturesBloquees(beau).size).toBe(0)
  })

  it('ne produit aucune cause d arret', () => {
    expect(causeArret(beau)).toBeNull()
  })
})

describe('seuil de pluie a 10 mm', () => {
  it('n est pas atteint a 10 mm exactement', () => {
    expect(naturesBloquees(avec({ precipitationsMm: 10 })).size).toBe(0)
  })

  it('est atteint juste au-dessus', () => {
    expect(naturesBloquees(avec({ precipitationsMm: 10.1 })).has('TERRASSEMENT')).toBe(true)
  })

  it('arrete les terrassements, les VRD, l etancheite et les enduits', () => {
    const b = naturesBloquees(avec({ precipitationsMm: 15 }))
    expect(b.has('TERRASSEMENT')).toBe(true)
    expect(b.has('VRD')).toBe(true)
    expect(b.has('ENROBES')).toBe(true)
    expect(b.has('ETANCHEITE')).toBe(true)
    expect(b.has('ENDUIT')).toBe(true)
  })

  it('n arrete PAS le betonnage structurel', () => {
    // On coule sous pluie legere, avec bachage et cure adaptee. Ce point a ete
    // corrige au sprint 1 : la regle initiale, calquee sur les terrassements,
    // produisait une derive de chantier trois fois trop forte.
    expect(naturesBloquees(avec({ precipitationsMm: 15 })).has('BETONNAGE')).toBe(false)
  })

  it('n arrete pas les travaux interieurs', () => {
    expect(naturesBloquees(avec({ precipitationsMm: 24 })).has('INTERIEUR')).toBe(false)
  })
})

describe('seuil de pluie forte a 25 mm', () => {
  it('n est pas atteint a 25 mm exactement', () => {
    expect(causeArret(avec({ precipitationsMm: 25 }))?.cause).toBe('PLUIE')
  })

  it('est atteint juste au-dessus', () => {
    expect(causeArret(avec({ precipitationsMm: 25.1 }))?.cause).toBe('PLUIE_FORTE')
  })

  it('arrete alors le betonnage', () => {
    expect(naturesBloquees(avec({ precipitationsMm: 30 })).has('BETONNAGE')).toBe(true)
  })

  it('arrete tout travail exterieur', () => {
    const b = naturesBloquees(avec({ precipitationsMm: 40 }))
    for (const n of [
      'TERRASSEMENT',
      'VRD',
      'FONDATION',
      'BETONNAGE',
      'LEVAGE',
      'MACONNERIE',
    ] as const) {
      expect(b.has(n)).toBe(true)
    }
  })

  it('laisse les travaux interieurs possibles', () => {
    expect(naturesBloquees(avec({ precipitationsMm: 40 })).has('INTERIEUR')).toBe(false)
  })
})

describe('seuils de vent', () => {
  it('50 km/h exactement ne suspend pas le levage', () => {
    expect(naturesBloquees(avec({ rafalesKmh: 50 })).has('LEVAGE')).toBe(false)
  })

  it('au-dessus de 50 km/h, le levage est suspendu', () => {
    expect(naturesBloquees(avec({ rafalesKmh: 50.1 })).has('LEVAGE')).toBe(true)
  })

  it('au-dessus de 72 km/h, l arret de grue est obligatoire', () => {
    expect(causeArret(avec({ rafalesKmh: 73 }))?.cause).toBe('VENT_GRUE')
  })

  it('l arret de grue emporte la charpente', () => {
    expect(naturesBloquees(avec({ rafalesKmh: 80 })).has('CHARPENTE')).toBe(true)
  })
})

describe('seuils de temperature', () => {
  it('40 degres exactement n interdisent pas le betonnage', () => {
    expect(naturesBloquees(avec({ temperatureMaxC: 40 })).has('BETONNAGE')).toBe(false)
  })

  it('au-dela de 40 degres, le betonnage sans cure renforcee est interdit', () => {
    expect(naturesBloquees(avec({ temperatureMaxC: 41 })).has('BETONNAGE')).toBe(true)
  })

  it('5 degres exactement n interdisent rien', () => {
    expect(naturesBloquees(avec({ temperatureMinC: 5 })).size).toBe(0)
  })

  it('sous 5 degres, betonnage et enduits sont interdits', () => {
    const b = naturesBloquees(avec({ temperatureMinC: 4.9 }))
    expect(b.has('BETONNAGE')).toBe(true)
    expect(b.has('ENDUIT')).toBe(true)
  })
})

describe('cause dominante', () => {
  it('la pluie forte prime sur la pluie', () => {
    expect(causeArret(avec({ precipitationsMm: 60 }))?.cause).toBe('PLUIE_FORTE')
  })

  it('l arret de grue prime sur la pluie simple', () => {
    expect(causeArret(avec({ precipitationsMm: 15, rafalesKmh: 90 }))?.cause).toBe('VENT_GRUE')
  })

  it('les seuils sont ordonnes du plus bloquant au moins bloquant', () => {
    // Invariant de conception : la lecture de la cause dominante repose sur
    // l ordre de declaration des seuils.
    expect(SEUILS[0]?.cause).toBe('PLUIE_FORTE')
  })

  it('cumuler plusieurs seuils cumule les natures bloquees', () => {
    const b = naturesBloquees(avec({ precipitationsMm: 15, temperatureMinC: 3 }))
    expect(b.has('TERRASSEMENT')).toBe(true)
    expect(b.has('BETONNAGE')).toBe(true)
  })
})
