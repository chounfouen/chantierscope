import { describe, expect, it } from 'vitest'
import { conformiteCoulage, fckDeClasse } from '@/db/compute/beton'

const serie = (prelevement: number, ageJ: number, valeurs: number[]) =>
  valeurs.map((resistanceMpa) => ({ prelevement, ageJ, resistanceMpa }))

const coulage = (eprouvettes: ReturnType<typeof serie>, classeBeton = 'C25/30') =>
  conformiteCoulage({
    classeBeton,
    dateCoulage: '2026-06-01',
    eprouvettes,
    aujourdhui: '2026-07-15',
  })

describe('classe de resistance', () => {
  it('lit fck sur cylindre', () => {
    expect(fckDeClasse('C25/30')).toBe(25)
    expect(fckDeClasse('c30/37')).toBe(30)
    expect(fckDeClasse('B25')).toBeNull()
  })
})

describe('controle d identite, NF EN 206 annexe B', () => {
  it('un seul prelevement de 24,3 MPa pour un C25/30 est conforme : le seuil est fck - 4', () => {
    const c = coulage(serie(1, 28, [24.1, 24.6, 24.2]))
    expect(c.etat).toBe('CONFORME')
    expect(c.seuilIndividuel).toBe(21)
    expect(c.seuilMoyenne).toBeNull()
  })

  it('un seul prelevement sous fck - 4 est non conforme', () => {
    const c = coulage(serie(1, 28, [24.8, 23.6, 24.5]), 'C30/37')
    expect(c.etat).toBe('NON_CONFORME')
    expect(c.motif).toMatch(/seuil individuel de 26 MPa/)
  })

  it('de deux a quatre resultats, la moyenne doit atteindre fck + 1', () => {
    const c = coulage([...serie(1, 28, [25.5, 25.9, 25.7]), ...serie(2, 28, [25.9, 26.1, 26.0])])
    expect(c.seuilMoyenne).toBe(26)
    expect(c.etat).toBe('NON_CONFORME')
    expect(c.motif).toMatch(/Moyenne/)
  })

  it('cinq resultats et plus portent le seuil de moyenne a fck + 2', () => {
    const p = [1, 2, 3, 4, 5].flatMap((i) => serie(i, 28, [27.5, 27.5, 27.5]))
    expect(coulage(p).seuilMoyenne).toBe(27)
    expect(coulage(p).etat).toBe('CONFORME')
  })

  it('un prelevement trop disperse n est pas juge', () => {
    const c = coulage(serie(1, 28, [20, 30, 25]))
    expect(c.etat).toBe('A_EXPLIQUER')
  })

  it('attend les essais a 28 jours, puis les reclame', () => {
    const attente = conformiteCoulage({
      classeBeton: 'C25/30',
      dateCoulage: '2026-07-01',
      eprouvettes: serie(1, 7, [19, 20, 19.5]),
      aujourdhui: '2026-07-15',
    })
    expect(attente.etat).toBe('EN_ATTENTE')
    expect(attente.echeance).toBe('2026-07-29')
    const retard = conformiteCoulage({
      classeBeton: 'C25/30',
      dateCoulage: '2026-06-01',
      eprouvettes: serie(1, 7, [19, 20, 19.5]),
      aujourdhui: '2026-07-15',
    })
    expect(retard.etat).toBe('RESULTAT_EN_RETARD')
  })

  it('un essai a 7 jours sous 60 % de fck donne l alerte, sans juger', () => {
    const c = coulage([...serie(1, 7, [13, 14, 13.5]), ...serie(1, 28, [27, 27.4, 26.8])])
    expect(c.alertePrecoce).toBe(true)
    expect(c.etat).toBe('CONFORME')
  })
})
