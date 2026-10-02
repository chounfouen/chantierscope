import { describe, expect, it } from 'vitest'
import {
  alertes,
  courbePlanifiee,
  dateApres,
  jourDepuis,
  prochainsJalons,
  projeterCourbe,
  projeterReseau,
  regleDepassements,
  regleJalons,
  regleNonConformites,
  regleReleves,
  regleTachesCritiques,
  syntheseA,
  tendances,
  type AleaSuivi,
  type CadreProjet,
  type EntreeAlertes,
  type JalonSuivi,
  type LigneSuivie,
  type PointSynthese,
  type ReleveSuivi,
  type TacheSuivie,
} from '@/db/compute/tableau'

const ORIGINE = '2026-03-02'
/** Jour 30 depuis l'ordre de service. */
const ANALYSE = '2026-04-01'

function tache(t: Partial<TacheSuivie> & { id: string }): TacheSuivie {
  return {
    codeWbs: t.id,
    nom: `Tâche ${t.id}`,
    debut: 0,
    duree: 10,
    debutImpose: null,
    debutReel: null,
    finReelle: null,
    avancement: 0,
    critique: false,
    ...t,
  }
}

function entree(e: Partial<EntreeAlertes>): EntreeAlertes {
  return {
    origine: ORIGINE,
    dateAnalyse: ANALYSE,
    taches: [],
    jalons: [],
    aleas: [],
    releves: [],
    lignes: [],
    ...e,
  }
}

describe('dates', () => {
  it('compte les jours depuis l origine et revient a la date', () => {
    expect(jourDepuis(ORIGINE, ANALYSE)).toBe(30)
    expect(dateApres(ORIGINE, 30)).toBe(ANALYSE)
    // Passage a l'heure d'ete en Europe : sans effet, le calcul est en UTC.
    expect(jourDepuis('2026-03-28', '2026-03-30')).toBe(2)
  })
})

/* -------------------------------------------------------------------------- */
/* Regles d'alerte : chacune declenchee et non declenchee                     */
/* -------------------------------------------------------------------------- */

describe('regle : tache critique en retard', () => {
  // Jour 30, tache des jours 21 a 40 : 10 jours ecoules sur 20, 50 % prevus.
  const base = { id: 't', debut: 21, duree: 20, critique: true }

  it('se declenche des une journee de retard', () => {
    const a = regleTachesCritiques(entree({ taches: [tache({ ...base, avancement: 0.45 })] }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ regle: 'TACHE_CRITIQUE_EN_RETARD', niveau: 'critique' })
    expect(a[0]?.ampleur).toBeCloseTo(1, 9)
    expect(a[0]?.detail).toContain('1 jour de retard')
  })

  it('ne se declenche pas sous une journee de retard', () => {
    expect(
      regleTachesCritiques(entree({ taches: [tache({ ...base, avancement: 0.46 })] })),
    ).toEqual([])
  })

  it('ne se declenche pas pour une tache non critique, meme tres en retard', () => {
    expect(
      regleTachesCritiques(
        entree({ taches: [tache({ ...base, critique: false, avancement: 0 })] }),
      ),
    ).toEqual([])
  })

  it('ne se declenche pas pour une tache achevee ni pour une tache pas encore prevue', () => {
    const t = [
      tache({ ...base, id: 'faite', avancement: 1 }),
      tache({ ...base, id: 'future', debut: 31, avancement: 0 }),
    ]
    expect(regleTachesCritiques(entree({ taches: t }))).toEqual([])
  })
})

describe('regle : jalon contractuel menace', () => {
  const jalon: JalonSuivi = {
    id: 'j',
    nom: 'Achèvement des fondations',
    contractuel: true,
    datePrevue: dateApres(ORIGINE, 40),
    dateReelle: null,
    tacheDeclenchanteId: 't',
  }

  it('se declenche quand la tache declenchante finit apres la date du jalon', () => {
    const j = prochainsJalons([jalon], new Map([['t', 43]]), ORIGINE, ANALYSE)
    const a = regleJalons(entree({ jalons: j }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ regle: 'JALON_MENACE', niveau: 'critique', ampleur: 3 })
  })

  it('ne se declenche pas quand la tache finit le jour meme du jalon', () => {
    const j = prochainsJalons([jalon], new Map([['t', 40]]), ORIGINE, ANALYSE)
    expect(regleJalons(entree({ jalons: j }))).toEqual([])
  })

  it('ne se declenche pas pour un jalon non contractuel, meme en glissement', () => {
    const j = prochainsJalons(
      [{ ...jalon, contractuel: false }],
      new Map([['t', 60]]),
      ORIGINE,
      ANALYSE,
    )
    expect(j[0]?.glissementJ).toBe(20)
    expect(regleJalons(entree({ jalons: j }))).toEqual([])
  })

  it('ne se declenche pas pour un jalon deja atteint', () => {
    const j = prochainsJalons(
      [{ ...jalon, dateReelle: dateApres(ORIGINE, 45) }],
      new Map([['t', 45]]),
      ORIGINE,
      ANALYSE,
    )
    expect(j).toEqual([])
  })
})

describe('regle : non-conformite ouverte depuis plus de sept jours', () => {
  const nc = (jours: number, statut: AleaSuivi['statut'] = 'OUVERT'): AleaSuivi => ({
    id: `nc-${jours}-${statut}`,
    type: 'NON_CONFORMITE',
    gravite: 2,
    statut,
    date: dateApres(ORIGINE, 30 - jours),
    description: 'Enrobage insuffisant.',
    lotId: null,
  })

  it('se declenche au huitieme jour', () => {
    const a = regleNonConformites(entree({ aleas: [nc(8)] }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ niveau: 'alerte', ampleur: 8 })
  })

  it('se declenche aussi en cours de traitement', () => {
    expect(regleNonConformites(entree({ aleas: [nc(12, 'EN_TRAITEMENT')] }))).toHaveLength(1)
  })

  it('ne se declenche pas au septieme jour', () => {
    expect(regleNonConformites(entree({ aleas: [nc(7)] }))).toEqual([])
  })

  it('ne se declenche pas une fois soldee, ni pour un autre type d alea', () => {
    expect(
      regleNonConformites(entree({ aleas: [nc(20, 'SOLDE'), { ...nc(20), type: 'INCIDENT' }] })),
    ).toEqual([])
  })
})

describe('regle : releve non valide depuis plus de trois jours', () => {
  const releve = (jours: number, statut: ReleveSuivi['statut']): ReleveSuivi => ({
    id: `r-${jours}-${statut}`,
    date: dateApres(ORIGINE, 30 - jours),
    statut,
    lotId: 'l',
    lotNom: 'Gros œuvre',
  })

  it('se declenche au quatrieme jour, soumis ou brouillon', () => {
    const a = regleReleves(entree({ releves: [releve(4, 'SOUMIS'), releve(5, 'BROUILLON')] }))
    expect(a.map((x) => x.ampleur).sort()).toEqual([4, 5])
    expect(a[0]?.niveau).toBe('information')
  })

  it('ne se declenche pas au troisieme jour', () => {
    expect(regleReleves(entree({ releves: [releve(3, 'SOUMIS')] }))).toEqual([])
  })

  it('ne se declenche pas pour un releve valide ou rectifie', () => {
    expect(
      regleReleves(entree({ releves: [releve(30, 'VALIDE'), releve(30, 'RECTIFIE')] })),
    ).toEqual([])
  })
})

describe('regle : depassement de quantitatif superieur a cinq pour cent', () => {
  const ligne = (realise: number): LigneSuivie => ({
    id: `l-${realise}`,
    designation: 'Béton armé pour voiles',
    unite: 'M3',
    codeWbs: '04.1.2',
    lotId: 'l',
    quantitePrevue: 100,
    quantiteRealisee: realise,
  })

  it('se declenche au-dela de cinq pour cent', () => {
    const a = regleDepassements(entree({ lignes: [ligne(105.1)] }))
    expect(a).toHaveLength(1)
    expect(a[0]?.detail).toContain('5,1 %')
  })

  it('ne se declenche pas a cinq pour cent tout juste, ni en dessous', () => {
    expect(regleDepassements(entree({ lignes: [ligne(105), ligne(100), ligne(40)] }))).toEqual([])
  })
})

describe('tri des alertes', () => {
  it('ordonne par niveau, puis par ampleur decroissante', () => {
    const a = alertes(
      entree({
        taches: [
          tache({ id: 'a', debut: 21, duree: 20, critique: true, avancement: 0.4 }),
          tache({ id: 'b', debut: 21, duree: 20, critique: true, avancement: 0.1 }),
        ],
        releves: [
          { id: 'r', date: dateApres(ORIGINE, 20), statut: 'SOUMIS', lotId: 'l', lotNom: 'L' },
        ],
        aleas: [
          {
            id: 'nc',
            type: 'NON_CONFORMITE',
            gravite: 3,
            statut: 'OUVERT',
            date: dateApres(ORIGINE, 10),
            description: 'x',
            lotId: null,
          },
        ],
      }),
    )
    expect(a.map((x) => x.cle)).toEqual(['tache:b', 'tache:a', 'alea:nc', 'releve:r'])
  })
})

/* -------------------------------------------------------------------------- */
/* Projection du reseau                                                       */
/* -------------------------------------------------------------------------- */

describe('projection du reseau', () => {
  const liaison = (amont: string, aval: string) => ({
    amont,
    aval,
    type: 'FD' as const,
    decalage: 0,
  })

  it('une tache entamee finit son reste a partir du lendemain, et repousse ses successeurs', () => {
    // A prevue jours 0 a 39, a moitie faite au jour 30 : il reste 20 jours.
    const fins = projeterReseau(
      [
        tache({ id: 'A', debut: 0, duree: 40, debutReel: 0, avancement: 0.5 }),
        tache({ id: 'B', debut: 40, duree: 10 }),
      ],
      [liaison('A', 'B')],
      30,
    )
    expect(fins.get('A')).toBe(50)
    expect(fins.get('B')).toBe(60)
  })

  it('une tache achevee garde ses dates reelles', () => {
    const fins = projeterReseau(
      [
        tache({ id: 'A', debut: 0, duree: 10, debutReel: 0, finReelle: 12, avancement: 1 }),
        tache({ id: 'B', debut: 10, duree: 10, debutReel: 13, finReelle: 20, avancement: 1 }),
      ],
      [liaison('A', 'B')],
      30,
    )
    expect(fins.get('B')).toBe(20)
  })

  it('une tache non commencee et en avance de planning garde sa date prevue', () => {
    const fins = projeterReseau([tache({ id: 'C', debut: 60, duree: 5, debutImpose: 60 })], [], 30)
    expect(fins.get('C')).toBe(64)
  })

  it('une tache non commencee qui aurait du demarrer part au plus tot demain', () => {
    const fins = projeterReseau([tache({ id: 'D', debut: 10, duree: 5 })], [], 30)
    expect(fins.get('D')).toBe(35)
  })
})

/* -------------------------------------------------------------------------- */
/* Indicateurs, tendances et projection de la courbe                          */
/* -------------------------------------------------------------------------- */

const CADRE: CadreProjet = {
  bacXof: 1_000_000,
  budgetDebourseXof: 850_000,
  dureeContractuelleJ: 100,
  montantMarcheXof: 1_000_000,
  tauxPenaliteJournaliere: 0.001,
}

/** Planifie lineaire de 10 000 par jour, realise a 80 % du planifie. */
function courbe(n: number): PointSynthese[] {
  return Array.from({ length: n }, (_, j) => {
    const vp = 10_000 * (j + 1)
    const va = 8_000 * (j + 1)
    return { date: dateApres(ORIGINE, j), avancement: va / 1_000_000, vp, va, cr: 9_000 * (j + 1) }
  })
}

describe('indicateurs a une date', () => {
  it('appliquent la valeur acquise au cout et lisent l ecart horizontalement', () => {
    const s = syntheseA(courbe(50), 49, CADRE)
    expect(s.vp).toBe(500_000)
    expect(s.va).toBe(400_000)
    expect(s.spi).toBeCloseTo(0.8, 12)
    // CPI = k x VA / CR = 0,85 x 400 000 / 450 000.
    expect(s.cpi).toBeCloseTo((0.85 * 400_000) / 450_000, 12)
    expect(s.eac).toBe(Math.round(850_000 / s.cpi!))
    expect(s.vac).toBe(850_000 - s.eac!)
    // La VA du jour 49 egale la VP du jour 39 : dix jours de retard.
    expect(s.ecartDelaiJ).toBeCloseTo(10, 9)
    expect(s.dureeProjeteeJ).toBe(125)
    expect(s.retardJ).toBe(25)
    expect(s.penaliteXof).toBe(25_000)
  })
})

describe('tendances sur trente jours', () => {
  it('rendent trente et une valeurs et la variation de la fenetre', () => {
    const t = tendances(courbe(50), CADRE)
    expect(t.avancement.serie).toHaveLength(31)
    expect(t.avancement.variation).toBeCloseTo(0.24, 12)
    // Ecart de delai : 20 % du temps ecoule, il croit de six jours en trente.
    expect(t.ecartDelaiJ.variation).toBeCloseTo(6, 9)
    expect(t.spi.variation).toBeCloseTo(0, 12)
  })

  it('ne donnent pas de variation sur une fenetre incomplete', () => {
    const t = tendances(courbe(12), CADRE)
    expect(t.spi.serie).toHaveLength(12)
    expect(t.spi.variation).toBeNull()
  })

  it('ne donnent pas de CPI sans cout reel', () => {
    const sansCout = courbe(40).map((p) => ({ ...p, cr: null }))
    const t = tendances(sansCout, CADRE)
    expect(t.cpi.serie.every((v) => v === null)).toBe(true)
  })
})

describe('projection de la courbe en S', () => {
  it('la courbe planifiee rejoint le budget a la fin du planning', () => {
    const vp = courbePlanifiee([
      { debut: 0, duree: 10, budget: 1000 },
      { debut: 5, duree: 10, budget: 3000 },
    ])
    expect(vp).toHaveLength(15)
    expect(vp[0]).toBe(100)
    expect(vp[14]).toBe(4000)
  })

  it('part de la valeur acquise du jour et aboutit au budget et a l EAC', () => {
    const vp = Array.from({ length: 100 }, (_, j) => 10_000 * (j + 1))
    const s = syntheseA(courbe(50), 49, CADRE)
    const p = projeterCourbe({
      courbeVp: vp,
      jourAnalyse: 49,
      va: s.va,
      cr: s.cr,
      spi: s.spi,
      cpi: s.cpi,
      ecartDelaiJ: s.ecartDelaiJ,
      coefficientDebourse: s.coefficientDebourse,
      bac: CADRE.bacXof,
    })
    expect(p[0]).toMatchObject({ jour: 49, va: 400_000, cr: 450_000 })
    const dernier = p[p.length - 1]!
    expect(dernier.va).toBe(1_000_000)
    expect(dernier.cr).toBe(s.eac)
    // Soixante jours de planning restants depuis le jour 39, au rythme 0,8.
    expect(dernier.jour).toBe(49 + 75)
  })

  it('ne projette rien sans indice de delai', () => {
    expect(
      projeterCourbe({
        courbeVp: [1, 2],
        jourAnalyse: 0,
        va: 0,
        cr: 0,
        spi: null,
        cpi: null,
        ecartDelaiJ: 0,
        coefficientDebourse: 1,
        bac: 2,
      }),
    ).toEqual([])
  })
})
