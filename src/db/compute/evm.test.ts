import { describe, expect, it } from 'vitest'
import { COUT, coutReel, ecartDelaiJours, indicateurs, penaliteXof } from '@/db/compute/evm'

/**
 * Cas de reference calcule a la main.
 *
 * BAC 1 000 000, a la date d analyse : VP 400 000, VA 320 000, CR 350 000.
 * Duree contractuelle 400 jours, montant du marche 1 000 000,
 * penalite d un millieme par jour.
 *
 *   EC  = VA - CR   = 320 000 - 350 000 = -30 000
 *   ED  = VA - VP   = 320 000 - 400 000 = -80 000
 *   CPI = VA / CR   = 320 000 / 350 000 = 0,914285714...
 *   SPI = VA / VP   = 320 000 / 400 000 = 0,8
 *   EAC = BAC / CPI = 1 000 000 x 350 000 / 320 000 = 1 093 750
 *   ETC = EAC - CR  = 1 093 750 - 350 000 = 743 750
 *   VAC = BAC - EAC = 1 000 000 - 1 093 750 = -93 750
 *   duree projetee  = 400 / 0,8 = 500 jours
 *   retard          = 500 - 400 = 100 jours
 *   penalite        = 100 x 0,001 x 1 000 000 = 100 000
 */
const REFERENCE = {
  bac: 1_000_000,
  valeurPlanifiee: 400_000,
  valeurAcquise: 320_000,
  coutReel: 350_000,
  dureeContractuelleJ: 400,
  montantMarcheXof: 1_000_000,
  tauxPenaliteJournaliere: 0.001,
}

describe('cas de reference calcule a la main', () => {
  const i = indicateurs(REFERENCE)

  it('ecart de cout', () => expect(i.ecartCout).toBe(-30_000))
  it('ecart de delai en valeur', () => expect(i.ecartDelaiValeur).toBe(-80_000))
  it('indice de performance des couts', () => expect(i.cpi).toBeCloseTo(0.914285714, 8))
  it('indice de performance des delais', () => expect(i.spi).toBe(0.8))
  it('cout estime a l achevement', () => expect(i.eac).toBe(1_093_750))
  it('reste a depenser', () => expect(i.etc).toBe(743_750))
  it('ecart final', () => expect(i.vac).toBe(-93_750))
  it('duree projetee', () => expect(i.dureeProjeteeJ).toBe(500))
  it('retard projete', () => expect(i.retardJ).toBe(100))
  it('penalite projetee', () => expect(i.penaliteXof).toBe(100_000))
})

describe('lecture des indicateurs', () => {
  it('un chantier a l heure et au budget donne des indices egaux a un', () => {
    const i = indicateurs({
      ...REFERENCE,
      valeurPlanifiee: 400_000,
      valeurAcquise: 400_000,
      coutReel: 400_000,
    })
    expect(i.spi).toBe(1)
    expect(i.cpi).toBe(1)
    expect(i.retardJ).toBe(0)
    expect(i.penaliteXof).toBe(0)
    expect(i.eac).toBe(i.bac)
  })

  it('une avance ne produit ni retard ni penalite', () => {
    const i = indicateurs({ ...REFERENCE, valeurAcquise: 500_000, coutReel: 400_000 })
    expect(i.spi).toBe(1.25)
    expect(i.retardJ).toBe(0)
    expect(i.penaliteXof).toBe(0)
    expect(i.dureeProjeteeJ).toBe(320)
  })

  it('un cout reel superieur a la valeur acquise donne un CPI sous un', () => {
    expect(indicateurs({ ...REFERENCE, coutReel: 640_000 }).cpi).toBe(0.5)
  })
})

describe('cas degeneres', () => {
  it('une valeur planifiee nulle rend le SPI indefini plutot qu infini', () => {
    const i = indicateurs({ ...REFERENCE, valeurPlanifiee: 0 })
    expect(i.spi).toBeNull()
    expect(i.dureeProjeteeJ).toBeNull()
    expect(i.retardJ).toBeNull()
  })

  it('un cout reel nul rend le CPI indefini plutot qu infini', () => {
    const i = indicateurs({ ...REFERENCE, coutReel: 0 })
    expect(i.cpi).toBeNull()
    expect(i.eac).toBeNull()
    expect(i.etc).toBeNull()
    expect(i.vac).toBeNull()
  })

  it('un chantier non demarre ne produit aucun indice', () => {
    const i = indicateurs({
      ...REFERENCE,
      valeurPlanifiee: 0,
      valeurAcquise: 0,
      coutReel: 0,
    })
    expect(i.spi).toBeNull()
    expect(i.cpi).toBeNull()
    expect(i.ecartCout).toBe(0)
  })

  it('les ecarts restent calculables meme quand les indices ne le sont pas', () => {
    const i = indicateurs({ ...REFERENCE, coutReel: 0 })
    expect(i.ecartCout).toBe(320_000)
    expect(i.ecartDelaiValeur).toBe(-80_000)
  })
})

describe('ecart de delai par lecture horizontale de la courbe en S', () => {
  // La courbe donne la valeur planifiee cumulee, jour par jour.
  const courbe = [0, 100, 200, 300, 400, 500]

  it('un chantier a l heure ne presente aucun ecart', () => {
    expect(ecartDelaiJours(courbe, 400, 4)).toBe(0)
  })

  it('trouve la date a laquelle le prevu egalait le realise', () => {
    // VA de 200 : le planifie valait 200 au jour 2, l analyse est au jour 4.
    expect(ecartDelaiJours(courbe, 200, 4)).toBe(2)
  })

  it('interpole entre deux journees', () => {
    // VA de 250 : entre le jour 2, a 200, et le jour 3, a 300. Soit 2,5.
    expect(ecartDelaiJours(courbe, 250, 4)).toBeCloseTo(1.5, 10)
  })

  it('une avance donne un ecart negatif', () => {
    expect(ecartDelaiJours(courbe, 500, 4)).toBeCloseTo(-1, 10)
  })

  it('une valeur acquise nulle renvoie le nombre de jours ecoules', () => {
    expect(ecartDelaiJours(courbe, 0, 4)).toBe(4)
  })

  it('une courbe plate ne provoque pas de division par zero', () => {
    expect(Number.isFinite(ecartDelaiJours([0, 0, 0, 0], 0, 3))).toBe(true)
  })

  it('une courbe vide renvoie zero', () => {
    expect(ecartDelaiJours([], 100, 10)).toBe(0)
  })

  it('l ecart en jours est coherent avec le SPI sur une courbe lineaire', () => {
    // Courbe lineaire de 0 a 1000 sur 100 jours, analyse au jour 50.
    const lineaire = Array.from({ length: 101 }, (_, j) => j * 10)
    const vp = 500
    const va = 400
    const spi = va / vp
    const ecart = ecartDelaiJours(lineaire, va, 50)
    // Sur une courbe lineaire, le retard vaut la duree ecoulee fois (1 - SPI).
    expect(ecart).toBeCloseTo(50 * (1 - spi), 6)
  })
})

describe('penalite de retard', () => {
  it('se calcule sur le montant du marche et le nombre de jours', () => {
    expect(penaliteXof(14, 0.001, 1_156_141_200)).toBe(16_185_977)
  })

  it('est nulle sans retard', () => {
    expect(penaliteXof(0, 0.001, 1_000_000_000)).toBe(0)
  })

  it('est nulle en cas d avance', () => {
    expect(penaliteXof(-10, 0.001, 1_000_000_000)).toBe(0)
  })

  it('est arrondie a l entier de FCFA', () => {
    expect(Number.isInteger(penaliteXof(7, 0.0013, 999_999_999))).toBe(true)
  })
})

describe('modele de cout reel', () => {
  it('additionne main d oeuvre, materiaux, frais de chantier et aleas', () => {
    const cr = coutReel({
      heuresOuvrier: 1000,
      journeesEncadrement: 10,
      valeurAcquiseXof: 1_000_000,
      joursEcoules: 20,
      coutAleasXof: 500_000,
    })
    const attendu =
      1000 * COUT.tauxHoraireOuvrier +
      10 * COUT.coutJourEncadrement +
      1_000_000 * COUT.partMateriaux +
      20 * COUT.fraisChantierJour +
      500_000
    expect(cr).toBe(Math.round(attendu))
  })

  it('un chantier sans activite ne coute que ses frais fixes', () => {
    const cr = coutReel({
      heuresOuvrier: 0,
      journeesEncadrement: 0,
      valeurAcquiseXof: 0,
      joursEcoules: 10,
      coutAleasXof: 0,
    })
    expect(cr).toBe(10 * COUT.fraisChantierJour)
  })

  it('rend un entier de FCFA', () => {
    const cr = coutReel({
      heuresOuvrier: 1234.56,
      journeesEncadrement: 7,
      valeurAcquiseXof: 987_654_321,
      joursEcoules: 3,
      coutAleasXof: 1,
    })
    expect(Number.isInteger(cr)).toBe(true)
  })
})

describe('lecture horizontale : cas limites de la branche d avance', () => {
  it('une valeur acquise superieure a toute la courbe donne l avance maximale', () => {
    // La courbe s arrete a 300 ; la valeur acquise la depasse. On ne peut pas
    // interpoler au-dela du planifie connu : l avance est bornee par la fin
    // de la courbe.
    expect(ecartDelaiJours([0, 100, 200, 300], 500, 3)).toBe(0)
  })

  it('une avance analysee avant la fin de la courbe s interpole', () => {
    // Analyse au jour 1, valeur acquise de 250 : le planifie atteindra 250
    // au jour 2,5. L avance vaut 1,5 jour.
    expect(ecartDelaiJours([0, 100, 200, 300], 250, 1)).toBeCloseTo(-1.5, 10)
  })

  it('un palier plat en avance ne provoque pas de division par zero', () => {
    // La courbe stagne a 200 entre les jours 2 et 3.
    const r = ecartDelaiJours([0, 100, 200, 200, 400], 200, 1)
    expect(Number.isFinite(r)).toBe(true)
  })

  it('une courbe entierement plate en avance reste finie', () => {
    expect(Number.isFinite(ecartDelaiJours([0, 0, 0], 50, 1))).toBe(true)
  })

  it('un jour d analyse au-dela de la courbe est ramene a sa derniere valeur', () => {
    expect(ecartDelaiJours([0, 100, 200], 100, 99)).toBe(98)
  })
})
