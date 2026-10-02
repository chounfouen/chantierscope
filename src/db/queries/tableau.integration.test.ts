/**
 * Concordance du tableau de bord avec le calcul de reference au tableur.
 *
 * Le classeur `docs/reference/indicateurs-reference.xlsx` est construit par
 * `scripts/reference/tableur.py` a partir des seules donnees sources du jeu de
 * demonstration, avec des formules de tableur redigees d'apres la
 * conception, puis recalcule par LibreOffice. Ses resultats sont dans
 * `docs/reference/indicateurs.json`.
 *
 * Ici, le chemin complet de l'application est rejoue a chaque date : calcul
 * du cache, lecture des instantanes par la requete du tableau de bord,
 * synthese par le noyau. Les treize indicateurs de la methode de la valeur
 * acquise, l'avancement et l'ecart de delai en jours doivent concorder.
 *
 * Les trois dates precedent toutes les journees que les autres suites
 * d'integration modifient : la base partagee est, pour elles, le jeu de
 * demonstration intact.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { syntheseA, type SyntheseIndicateurs } from '@/db/compute/tableau'
import { dbScript } from '@/db/index'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerTableau } from '@/db/queries/tableau'
import { recompute } from '@/db/recompute'

const { db, fermer } = dbScript()

type Reference = {
  dates: string[]
  indicateurs: Record<string, Record<string, number>>
}

const REFERENCE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../docs/reference/indicateurs.json'), 'utf8'),
) as Reference

/** Les treize indicateurs du tableau 4.3 de la conception, hors BAC et k. */
const MONTANTS = ['vp', 'va', 'cr', 'ecartCout', 'ecartDelaiValeur', 'eac', 'etc', 'vac'] as const
const INDICES = ['cpi', 'spi'] as const
const DUREES = ['dureeProjeteeJ', 'retardJ'] as const

afterAll(async () => {
  // Le cache est rendu a la date du jour pour les suites suivantes.
  await recompute(db, await premierProjetId(db))
  await fermer()
})

describe.each(REFERENCE.dates)('au %s', (date) => {
  const attendu = REFERENCE.indicateurs[date] as Record<string, number>
  let s: SyntheseIndicateurs

  it('le cache se calcule a cette date', async () => {
    const projetId = await premierProjetId(db)
    await recompute(db, projetId, { dateAnalyse: date })
    const t = await chargerTableau(db, projetId, true)
    expect(t.courbe.at(-1)?.date).toBe(date)
    s = syntheseA(t.courbe, t.courbe.length - 1, t.cadre)
  })

  it.each(MONTANTS)('%s concorde au franc pres', (cle) => {
    // Un franc de tolerance : le tableur arrondit les demis a l'oppose de
    // zero, JavaScript vers le haut.
    expect(Math.abs((s[cle] as number) - (attendu[cle] as number))).toBeLessThanOrEqual(1)
  })

  it.each(INDICES)('%s concorde a 1e-9 pres', (cle) => {
    expect(s[cle]).toBeCloseTo(attendu[cle] as number, 9)
  })

  it.each(DUREES)('%s concorde au jour pres', (cle) => {
    expect(s[cle]).toBe(attendu[cle])
  })

  it('la penalite prevue concorde au franc pres', () => {
    expect(Math.abs(s.penaliteXof - (attendu['penaliteXof'] as number))).toBeLessThanOrEqual(1)
  })

  it('l avancement et l ecart de delai en jours concordent', () => {
    // L'avancement est stocke a six decimales.
    expect(s.avancement).toBeCloseTo(attendu['avancement'] as number, 6)
    expect(s.ecartDelaiJ).toBeCloseTo(attendu['ecartDelaiJ'] as number, 6)
  })
})
