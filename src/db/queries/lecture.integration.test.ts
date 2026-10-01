/**
 * Le filtrage des donnees reservees est verifie sur la CHARGE UTILE renvoyee
 * par la requete, et non sur l'affichage.
 *
 * Masquer une valeur a l'ecran est une securite de facade : elle reste
 * lisible dans la charge serialisee envoyee au navigateur. La seule mesure
 * qui tienne est de ne pas selectionner la colonne.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dbScript } from '@/db/index'
import { chargerLot, chargerSynthese, projetsAccessibles } from '@/db/queries/lecture'
import { premierProjetId } from '@/db/queries/contexte'
import { recompute } from '@/db/recompute'

const { db, client, fermer } = dbScript()
let projetId: string

beforeAll(async () => {
  projetId = await premierProjetId(db)
  await recompute(db, projetId, { dateAnalyse: '2026-09-30' })
})

afterAll(async () => {
  await fermer()
})

describe('synthese pour un role interne', () => {
  it('porte le cout reel et l indice de cout', async () => {
    const s = await chargerSynthese(db, projetId, true)
    expect(s.global?.coutReelXof).not.toBeNull()
    expect(s.global?.cpi).not.toBeNull()
    expect(s.lots.every((l) => l.coutReelXof !== null)).toBe(true)
  })

  it('porte l avancement et les indices de delai', async () => {
    const s = await chargerSynthese(db, projetId, true)
    expect(s.global?.spi).not.toBeNull()
    expect(s.global?.avancement).toBeGreaterThan(0)
  })
})

describe('synthese pour la maitrise d ouvrage', () => {
  it('ne porte aucun cout reel', async () => {
    const s = await chargerSynthese(db, projetId, false)
    expect(s.global?.coutReelXof).toBeNull()
    expect(s.lots.every((l) => l.coutReelXof === null)).toBe(true)
  })

  it('ne porte aucun indice de cout', async () => {
    const s = await chargerSynthese(db, projetId, false)
    expect(s.global?.cpi).toBeNull()
  })

  it('conserve l avancement, la valeur acquise et le SPI', async () => {
    // Le maitre d ouvrage a droit au suivi de son operation : ce qui est
    // masque, ce sont les donnees internes a l entreprise, pas l avancement.
    const s = await chargerSynthese(db, projetId, false)
    expect(s.global?.avancement).toBeGreaterThan(0)
    expect(s.global?.valeurAcquiseXof).toBeGreaterThan(0)
    expect(s.global?.spi).not.toBeNull()
  })

  it('ne laisse fuir aucune valeur de cout dans la charge utile serialisee', async () => {
    // Verification sur la serialisation elle-meme : c est ce qui part vers le
    // navigateur. Un masquage a l affichage laisserait ces valeurs ici.
    const interne = await chargerSynthese(db, projetId, true)
    const reserve = await chargerSynthese(db, projetId, false)

    const coutReel = interne.global?.coutReelXof
    expect(coutReel).toBeGreaterThan(0)

    const charge = JSON.stringify(reserve)
    expect(charge).not.toContain(String(coutReel))
    for (const lot of interne.lots) {
      if (lot.coutReelXof !== null && lot.coutReelXof > 0) {
        expect(charge).not.toContain(String(lot.coutReelXof))
      }
    }
  })

  it('les deux syntheses coincident sur tout le reste', async () => {
    const interne = await chargerSynthese(db, projetId, true)
    const reserve = await chargerSynthese(db, projetId, false)
    expect(reserve.projet).toEqual(interne.projet)
    expect(reserve.dateAnalyse).toBe(interne.dateAnalyse)
    expect(reserve.lots.map((l) => l.avancement)).toEqual(interne.lots.map((l) => l.avancement))
  })
})

describe('detail d un lot', () => {
  it('charge les taches, leur quantitatif et les cumuls realises', async () => {
    const [lot] = await client<{ id: string }[]>`select id from lot order by ordre limit 1`
    const d = await chargerLot(db, lot?.id as string)

    expect(d.taches.length).toBeGreaterThan(0)
    expect(d.taches.every((t) => t.lignes.length > 0)).toBe(true)
    expect(d.taches.some((t) => t.lignes.some((l) => l.quantiteRealisee > 0))).toBe(true)
  })

  it('le total des montants de lignes egale le poids budgetaire de la tache', async () => {
    const [lot] = await client<{ id: string }[]>`select id from lot order by ordre limit 1`
    const d = await chargerLot(db, lot?.id as string)
    for (const t of d.taches) {
      const somme = t.lignes.reduce((s, l) => s + l.montantXof, 0)
      expect(Math.abs(somme - t.poidsBudgetaireXof)).toBeLessThan(2)
    }
  })

  it('aucun avancement de ligne ne depasse cent pour cent', async () => {
    const [lot] = await client<{ id: string }[]>`select id from lot order by ordre limit 1`
    const d = await chargerLot(db, lot?.id as string)
    for (const t of d.taches) {
      for (const l of t.lignes) expect(l.avancement).toBeLessThanOrEqual(1)
    }
  })

  it('refuse un lot inconnu par un message explicite', async () => {
    await expect(chargerLot(db, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      /Lot introuvable/,
    )
  })
})

describe('projets accessibles', () => {
  it('chaque compte de demonstration accede au chantier', async () => {
    const comptes = await client<{ id: string; role: string }[]>`
      select id, role::text as role from utilisateur order by role`
    for (const c of comptes) {
      const projets = await projetsAccessibles(db, c.id)
      expect(projets.length, `role ${c.role}`).toBe(1)
    }
  })

  it('un compte sans rattachement ne voit aucun projet', async () => {
    const projets = await projetsAccessibles(db, '00000000-0000-0000-0000-000000000000')
    expect(projets).toEqual([])
  })
})
