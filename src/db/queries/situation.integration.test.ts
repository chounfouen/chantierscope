/**
 * Situations mensuelles sur le jeu de demonstration : un decompte par mois,
 * de l'ordre de service a la date d'etat, coherent avec le tableau de bord.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { premierProjetId } from '@/db/queries/contexte'
import { chargerSituations } from '@/db/queries/situation'
import { recompute } from '@/db/recompute'

const { db, client, fermer } = dbScript()

// Le peuplement ne calcule pas le cache : les instantanes viennent d'ici.
beforeAll(async () => {
  await recompute(db, await premierProjetId(db))
})

afterAll(async () => {
  await fermer()
})

describe('situations du jeu de demonstration', () => {
  it('un decompte par mois, la somme des paiements egale le net cumule', async () => {
    const projetId = await premierProjetId(db)
    const d = await chargerSituations(db, projetId, '2026-10-20')
    const [etat] = await client<{ date: string; va: number }[]>`
      select date::text as date, valeur_acquise_xof::float8 as va from snapshot_avancement
       where projet_id = ${projetId}::uuid and lot_id is null order by date desc limit 1`

    expect(d.situations[0]?.mois).toBe('2026-03')
    expect(d.situations.at(-1)?.date).toBe(etat?.date)
    expect(d.situations.at(-1)?.travauxXof).toBe(Math.round(etat?.va as number))
    const mois = new Set(d.situations.map((s) => s.mois))
    expect(mois.size).toBe(d.situations.length)

    const total = d.situations.reduce((t, s) => t + s.aPayerXof, 0)
    expect(total).toBe(d.situations.at(-1)?.netCumuleXof)
  })

  it('applique les clauses du CCAP : retenue de 5 %, avance de 15 % non encore remboursee', async () => {
    const d = await chargerSituations(db, await premierProjetId(db), '2026-10-20')
    expect(d.avanceXof).toBe(Math.round(0.15 * d.clauses.montantInitialXof))
    for (const s of d.situations) {
      // La retenue porte sur les travaux revises.
      expect(s.retenueGarantieXof).toBe(Math.round(0.05 * (s.travauxXof + s.revisionXof)))
      // Le chantier n'a pas atteint 65 % d'execution, ni son delai.
      expect(s.remboursementAvanceXof).toBe(0)
      expect(s.penalitesXof).toBe(0)
    }
    // Seul le dernier mois, arrete avant sa fin, est provisoire.
    expect(d.situations.filter((s) => s.provisoire).length).toBeLessThanOrEqual(1)
  })

  it('les decomptes acceptes sont figes, aout attend la decision du maitre d oeuvre', async () => {
    const d = await chargerSituations(db, await premierProjetId(db), '2026-10-20')
    const statuts = Object.fromEntries(d.situations.map((s) => [s.mois, s.statut]))
    expect(statuts['2026-03']).toBe('ACCEPTEE')
    expect(statuts['2026-07']).toBe('ACCEPTEE')
    expect(statuts['2026-08']).toBe('PRESENTEE')
    expect(statuts['2026-09']).toBe('PROJETEE')
    // Seul un mois acheve se presente : septembre, une fois son journal clos.
    const derniere = d.situations.at(-1)
    expect(d.moisPresentable === null || d.moisPresentable === '2026-09').toBe(true)
    if (derniere?.provisoire) expect(d.moisPresentable).not.toBe(derniere.mois)
    // Septembre n'a pas encore son index : revision provisoire.
    expect(d.situations.at(-1)?.indiceProvisoire).toBe(true)
  })
})

