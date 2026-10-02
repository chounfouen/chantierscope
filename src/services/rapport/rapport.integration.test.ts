/**
 * Rapport hebdomadaire, sur la base d'integration.
 *
 * Le rapport doit dire ce que dit le tableau de bord : ses indicateurs de fin
 * de periode sont confrontes au calcul de reference au tableur, a la meme
 * date que la suite de concordance.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { premierProjetId } from '@/db/queries/contexte'
import { recompute } from '@/db/recompute'
import {
  assemblerRapport,
  PeriodeHorsSituation,
  type ContenuRapport,
} from '@/services/rapport/contenu'
import { genererPdf } from '@/services/rapport/document'

const { db, fermer } = dbScript()
const FIN = '2026-09-27'
const REFERENCE = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../docs/reference/indicateurs.json'), 'utf8'),
) as { indicateurs: Record<string, Record<string, number>> }

let projetId: string
let interne: ContenuRapport
let externe: ContenuRapport

beforeAll(async () => {
  projetId = await premierProjetId(db)
  await recompute(db, projetId)
  interne = (await assemblerRapport(db, projetId, true, FIN)) as ContenuRapport
  externe = (await assemblerRapport(db, projetId, false, FIN)) as ContenuRapport
})

afterAll(async () => {
  await fermer()
})

describe('contenu', () => {
  it('couvre la semaine finissant a la date demandee', () => {
    expect(interne.periode).toEqual({ debut: '2026-09-21', fin: FIN })
  })

  it('donne les indicateurs du calcul de reference en fin de periode', () => {
    const r = REFERENCE.indicateurs[FIN] as Record<string, number>
    expect(interne.fin.avancement).toBeCloseTo(r['avancement'] as number, 6)
    expect(interne.fin.spi).toBeCloseTo(r['spi'] as number, 9)
    expect(interne.fin.cpi).toBeCloseTo(r['cpi'] as number, 9)
    expect(Math.abs((interne.fin.eac as number) - (r['eac'] as number))).toBeLessThanOrEqual(1)
    expect(interne.fin.penaliteXof).toBe(r['penaliteXof'])
  })

  it('ouvre les faits marquants sur le mouvement de l avancement', () => {
    expect(interne.faits[0]).toMatch(/^L’avancement passe de .* sur la semaine/)
  })

  it('compte sept journees d effectifs pour l entreprise, aucune pour le maitre d ouvrage', () => {
    expect(interne.effectifs).toHaveLength(7)
    expect(externe.effectifs).toEqual([])
    expect(externe.fin.cpi).toBeNull()
    expect(externe.periodeLue.journees.every((j) => j.ouvriers === null)).toBe(true)
  })

  it('embarque les photos converties en JPEG', () => {
    expect(interne.photos.length).toBeGreaterThan(0)
    for (const p of interne.photos) expect([...p.jpeg.subarray(0, 2)]).toEqual([0xff, 0xd8])
  })

  it('refuse une periode posterieure a la situation', async () => {
    await expect(assemblerRapport(db, projetId, true, '2030-01-01')).rejects.toBeInstanceOf(
      PeriodeHorsSituation,
    )
  })
})

describe('document', () => {
  it('produit un PDF de quatre pages', async () => {
    const pdf = await genererPdf(interne)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(4)
  })
})
