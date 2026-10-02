import { describe, expect, it } from 'vitest'
import {
  libelleGraduation,
  libelleMeteo,
  aujourdhui,
  dateCourte,
  dateLongue,
  ecartJours,
  fcfa,
  fcfaCompact,
  fcfaNu,
  fcfaSigne,
  indice,
  instant,
  jours,
  moisCourt,
  pourcent,
  pourcentSigne,
  quantite,
} from '@/lib/format'

/** Les separateurs de milliers de fr-FR sont des espaces insecables etroites. */
const normaliser = (s: string) => s.replace(/ | /g, ' ')

describe('montants en FCFA', () => {
  it('formate un montant avec sa devise', () => {
    expect(normaliser(fcfa(1_156_141_200))).toBe('1 156 141 200 F CFA')
  })

  it('n affiche aucune decimale', () => {
    expect(fcfa(1234.7)).not.toContain(',')
  })

  it('arrondit a l entier de FCFA', () => {
    expect(normaliser(fcfa(1234.7))).toBe('1 235 F CFA')
  })

  it('formate zero', () => {
    expect(normaliser(fcfa(0))).toBe('0 F CFA')
  })

  it('formate un montant negatif', () => {
    expect(normaliser(fcfa(-45_000))).toContain('45 000')
  })

  it('la forme nue omet la devise', () => {
    expect(normaliser(fcfaNu(1_156_141_200))).toBe('1 156 141 200')
  })

  it('reste exact sur un montant proche de la limite de precision', () => {
    // Le FCFA n a pas de subdivision : les montants sont des entiers, exacts
    // en JavaScript jusqu a 9 007 199 254 740 991.
    expect(normaliser(fcfaNu(9_007_199_254_740_991))).toBe('9 007 199 254 740 991')
  })
})

describe('forme compacte', () => {
  it('abrege les milliards', () => {
    expect(fcfaCompact(2_100_000_000)).toBe('2,10 Md')
  })

  it('abrege les millions', () => {
    expect(fcfaCompact(847_300_000)).toBe('847,3 M')
  })

  it('abrege les milliers', () => {
    expect(fcfaCompact(45_600)).toBe('45,6 k')
  })

  it('laisse les petits montants entiers', () => {
    expect(normaliser(fcfaCompact(842))).toBe('842')
  })

  it('conserve le signe des montants negatifs', () => {
    expect(fcfaCompact(-2_100_000_000)).toBe('-2,10 Md')
  })

  it('formate zero sans suffixe', () => {
    expect(fcfaCompact(0)).toBe('0')
  })
})

describe('quantites', () => {
  it('formate un volume de beton au centieme', () => {
    expect(normaliser(quantite(1284.5, 'M3'))).toBe('1 284,50 m3')
  })

  it('formate une masse d acier au millieme de tonne', () => {
    expect(quantite(97.42, 'T')).toBe('97,420 t')
  })

  it('ne met pas de decimale sur un comptage d unites', () => {
    expect(quantite(24, 'U')).toBe('24 u')
  })

  it('ne met pas de decimale sur un forfait', () => {
    expect(quantite(1, 'FORFAIT')).toBe('1 forfait')
  })

  it('accepte une quantite recue en chaine depuis le pilote', () => {
    expect(normaliser(quantite('1284.500', 'M3'))).toBe('1 284,50 m3')
  })
})

describe('pourcentages et indices', () => {
  it('ecrit un ecart signe, sans zero negatif', () => {
    expect(normaliser(pourcentSigne(0.024))).toBe('+2,4 %')
    expect(normaliser(pourcentSigne(-0.062))).toBe('-6,2 %')
    expect(normaliser(pourcentSigne(-0.0001))).toBe('0,0 %')
  })

  it('formate une fraction en pourcentage', () => {
    expect(normaliser(pourcent(0.4035))).toBe('40,4 %')
  })

  it('accepte un nombre de decimales', () => {
    expect(normaliser(pourcent(0.4035, 2))).toBe('40,35 %')
  })

  it('formate un indice a trois decimales', () => {
    // A deux decimales, un indice de 0,995 deviendrait 1,00 et une derive
    // reelle disparaitrait de l affichage.
    expect(indice(0.995)).toBe('0,995')
    expect(indice(0.902)).toBe('0,902')
  })

  it('affiche un tiret pour un indice indefini', () => {
    expect(indice(Number.POSITIVE_INFINITY)).toBe('—')
    expect(indice(Number.NaN)).toBe('—')
  })
})

describe('ecarts signes', () => {
  it('prefixe un retard d un signe moins', () => {
    expect(jours(-14)).toBe('-14 j')
  })

  it('prefixe une avance d un signe plus', () => {
    expect(jours(7)).toBe('+7 j')
  })

  it('n affiche aucun signe pour zero', () => {
    expect(jours(0)).toBe('0 j')
  })

  it('applique la meme regle aux montants', () => {
    expect(fcfaSigne(0)).not.toContain('+')
    expect(normaliser(fcfaSigne(1_000))).toContain('+')
    expect(normaliser(fcfaSigne(-1_000))).toContain('-')
  })
})

describe('dates', () => {
  it('formate une date de planning en jour, mois, annee', () => {
    expect(dateCourte('2026-03-02')).toBe('02/03/2026')
  })

  it('formate une date en toutes lettres', () => {
    expect(dateLongue('2026-03-02')).toBe('2 mars 2026')
  })

  it('abrege un mois pour une graduation d axe', () => {
    expect(moisCourt('2026-03-02')).toBe('mars 26')
  })

  it('ne decale pas la date d un jour', () => {
    // Piege du fuseau : une date de planning n a ni heure ni fuseau. La
    // formater en passant par un instant UTC la ferait basculer la veille
    // dans les fuseaux negatifs.
    expect(dateCourte('2026-01-01')).toBe('01/01/2026')
    expect(dateCourte('2026-12-31')).toBe('31/12/2026')
  })

  it('formate un instant reel avec son heure', () => {
    expect(instant(new Date('2026-09-30T14:25:00'))).toBe('30/09/2026 a 14h25')
  })

  it('rend la date du jour au format des dates de planning', () => {
    expect(aujourdhui()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('ecart entre deux dates', () => {
  it('compte les jours calendaires', () => {
    expect(ecartJours('2026-03-02', '2026-03-12')).toBe(10)
  })

  it('rend zero pour une meme date', () => {
    expect(ecartJours('2026-03-02', '2026-03-02')).toBe(0)
  })

  it('rend une valeur negative si la seconde date precede', () => {
    expect(ecartJours('2026-03-12', '2026-03-02')).toBe(-10)
  })

  it('traverse correctement un changement d annee', () => {
    expect(ecartJours('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('compte la duree du chantier de demonstration', () => {
    expect(ecartJours('2026-03-02', '2027-04-17')).toBe(411)
  })
})

describe('libelle meteo', () => {
  it('regroupe les codes WMO par famille', () => {
    expect(libelleMeteo(0)).toBe('Ciel dégagé')
    expect(libelleMeteo(2)).toBe('Nuageux')
    expect(libelleMeteo(45)).toBe('Brouillard')
    expect(libelleMeteo(53)).toBe('Bruine')
    expect(libelleMeteo(63)).toBe('Pluie')
    expect(libelleMeteo(73)).toBe('Neige')
    expect(libelleMeteo(81)).toBe('Averses')
    expect(libelleMeteo(95)).toBe('Orage')
  })

  it('signale une meteo absente plutot que de la deviner', () => {
    expect(libelleMeteo(null)).toBe('Météo non relevée')
  })

  it('garde le code brut quand il ne correspond a aucune famille', () => {
    expect(libelleMeteo(30)).toBe('Code météo 30')
  })
})

describe('graduations du Gantt', () => {
  const lundi = new Date(Date.UTC(2026, 2, 16))

  it('libelle chaque periode', () => {
    expect(libelleGraduation(lundi, 'jour', 'mineure')).toBe('16')
    expect(libelleGraduation(lundi, 'semaine', 'majeure')).toBe('Semaine du 16 mars 2026')
    expect(libelleGraduation(lundi, 'semaine', 'mineure')).toBe('16 mars')
    expect(libelleGraduation(lundi, 'mois', 'majeure')).toBe('mars 2026')
    expect(libelleGraduation(new Date(Date.UTC(2026, 6, 1)), 'trimestre', 'mineure')).toBe('T3')
    expect(libelleGraduation(new Date(Date.UTC(2027, 0, 1)), 'annee', 'majeure')).toBe('2027')
  })

  it('ne recule pas d un jour a l ouest de Greenwich', () => {
    // Un minuit UTC formate tel quel a Abidjan comme a Montreal doit garder
    // son jour : le libelle est construit sur les champs UTC.
    expect(libelleGraduation(new Date(Date.UTC(2026, 3, 1)), 'jour', 'mineure')).toBe('1')
  })
})
