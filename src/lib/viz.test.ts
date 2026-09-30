import { describe, expect, it } from 'vitest'
import { COURBE_S, NOMBRE_SERIES, SERIES, teinteSerie } from '@/lib/viz'
import { ETAT, ETATS } from '@/lib/etats'
import { Icone } from '@/lib/icones'

describe('palette categorielle', () => {
  it('compte huit emplacements, un par lot', () => {
    expect(NOMBRE_SERIES).toBe(8)
  })

  it('rend la teinte correspondant au rang', () => {
    expect(teinteSerie(0)).toBe(SERIES[0])
    expect(teinteSerie(7)).toBe(SERIES[7])
  })

  it('refuse un rang au-dela de la palette plutot que de cycler', () => {
    // Une neuvieme entite n obtient pas une teinte generee : elle doit etre
    // repliee dans un groupe « Autres » ou facettee. Lever oblige a traiter
    // le cas en amont plutot qu a le colorer silencieusement mal.
    expect(() => teinteSerie(8)).toThrow(/hors de la palette/)
  })

  it('refuse un rang negatif', () => {
    expect(() => teinteSerie(-1)).toThrow()
  })

  it('les huit teintes sont distinctes', () => {
    expect(new Set(SERIES).size).toBe(8)
  })

  it('la courbe en S utilise les trois premiers emplacements', () => {
    // Seuls les trois premiers valident en mode toutes paires, dans les deux
    // themes. Voir le rapport de validation dans docs/PLAN.md.
    expect(COURBE_S.valeurPlanifiee.couleur).toBe(SERIES[0])
    expect(COURBE_S.valeurAcquise.couleur).toBe(SERIES[1])
    expect(COURBE_S.coutReel.couleur).toBe(SERIES[2])
  })
})

describe('etats d avancement', () => {
  it('compte six etats', () => {
    expect(ETATS.length).toBe(6)
  })

  it('chaque etat porte un libelle, une couleur, une icone et une definition', () => {
    for (const code of ETATS) {
      const e = ETAT[code]
      expect(e.libelle.length).toBeGreaterThan(0)
      expect(e.couleur.length).toBeGreaterThan(0)
      // Les icones Lucide sont des composants a reference transmise, donc des
      // objets et non des fonctions.
      expect(e.icone).toBeDefined()
      expect(e.definition.length).toBeGreaterThan(0)
    }
  })

  it('aucune couleur d etat ne reutilise une teinte de serie', () => {
    // Les couleurs de statut sont reservees : une teinte de serie ne doit
    // jamais pouvoir passer pour un etat, ni l inverse.
    const teintes = new Set<string>(SERIES)
    for (const code of ETATS) {
      expect(teintes.has(ETAT[code].couleur)).toBe(false)
    }
  })

  it('les libelles sont distincts', () => {
    expect(new Set(ETATS.map((c) => ETAT[c].libelle)).size).toBe(ETATS.length)
  })
})

describe('table des icones', () => {
  it('chaque entree est un composant', () => {
    for (const [nom, composant] of Object.entries(Icone)) {
      expect(composant, `l icone ${nom} doit etre un composant`).toBeTypeOf('object')
    }
  })

  it('couvre les notions metier essentielles', () => {
    for (const nom of [
      'projet',
      'lot',
      'tache',
      'jalon',
      'planning',
      'cout',
      'meteo',
      'alerte',
    ] as const) {
      expect(Icone[nom]).toBeDefined()
    }
  })
})
