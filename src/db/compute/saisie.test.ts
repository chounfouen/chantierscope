import { describe, expect, it } from 'vitest'
import { controlerQuantite } from '@/db/compute/saisie'

const base = { quantitePrevue: 100, cumulValide: 40, cumulEnAttente: 0 }

describe('controle d une quantite saisie', () => {
  it('sans saisie, le niveau est vide et rien ne bouge', () => {
    const r = controlerQuantite({ ...base, saisie: null })
    expect(r.niveau).toBe('vide')
    expect(r.cumulApres).toBe(40)
    expect(r.resteAvant).toBe(60)
    expect(r.depassement).toBe(0)
  })

  it('une saisie nulle est traitee comme une absence de saisie', () => {
    expect(controlerQuantite({ ...base, saisie: 0 }).niveau).toBe('vide')
  })

  it('une saisie sous le reste est normale', () => {
    const r = controlerQuantite({ ...base, saisie: 25 })
    expect(r.niveau).toBe('normal')
    expect(r.cumulApres).toBe(65)
    expect(r.fractionApres).toBeCloseTo(0.65, 10)
  })

  it('une saisie egale au reste solde la ligne, sans depassement', () => {
    const r = controlerQuantite({ ...base, saisie: 60 })
    expect(r.niveau).toBe('solde')
    expect(r.depassement).toBe(0)
  })

  it('une saisie au-dela du reste est signalee avec la quantite excedentaire', () => {
    const r = controlerQuantite({ ...base, saisie: 72.5 })
    expect(r.niveau).toBe('depassement')
    expect(r.depassement).toBe(12.5)
    expect(r.fractionApres).toBeCloseTo(1.125, 10)
  })

  it('le cumul en attente de validation compte pour l alerte', () => {
    // Deux releves non valides, chacun sous le prevu, le depassent ensemble.
    const r = controlerQuantite({ ...base, cumulEnAttente: 50, saisie: 20 })
    expect(r.cumulAvant).toBe(90)
    expect(r.resteAvant).toBe(10)
    expect(r.niveau).toBe('depassement')
    expect(r.depassement).toBe(10)
  })

  it('le reste avant saisie n est jamais negatif sur une ligne deja depassee', () => {
    const r = controlerQuantite({ ...base, cumulValide: 110, saisie: 5 })
    expect(r.resteAvant).toBe(0)
    expect(r.depassement).toBe(15)
  })

  it('un ecart d arrondi flottant n est pas un depassement', () => {
    // 0,1 + 0,2 vaut 0,30000000000000004 en virgule flottante.
    const r = controlerQuantite({
      quantitePrevue: 0.3,
      cumulValide: 0.1,
      cumulEnAttente: 0,
      saisie: 0.2,
    })
    expect(r.niveau).toBe('solde')
    expect(r.depassement).toBe(0)
  })

  it('un millieme au-dela du prevu est un depassement', () => {
    const r = controlerQuantite({ ...base, saisie: 60.001 })
    expect(r.niveau).toBe('depassement')
    expect(r.depassement).toBe(0.001)
  })

  it('une ligne a quantite prevue nulle donne une fraction nulle plutot qu infinie', () => {
    const r = controlerQuantite({
      quantitePrevue: 0,
      cumulValide: 0,
      cumulEnAttente: 0,
      saisie: 3,
    })
    expect(r.fractionApres).toBe(0)
    expect(r.niveau).toBe('depassement')
  })
})
