import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  cleBrouillon,
  DUREE_VIE_BROUILLON_MS,
  ecrireBrouillon,
  effacerBrouillon,
  lireBrouillon,
} from '@/lib/hors-ligne/brouillon'
import { etatVierge } from '@/lib/releve-formulaire'

const MAINTENANT = Date.parse('2026-10-20T10:00:00Z')

function brouillon(cle: string, utilisateurId = 'chef', majLe = MAINTENANT) {
  return {
    cle,
    utilisateurId,
    etat: { ...etatVierge('r-1', '2026-10-20', 'lot-1'), effectifOuvriers: '12' },
    indice: 4,
    photos: [],
    majLe,
  }
}

describe('brouillon local du formulaire', () => {
  it('un nouveau releve a une cle par projet, un releve existant la sienne', () => {
    expect(cleBrouillon('p', null)).toBe('p:nouveau')
    expect(cleBrouillon('p', 'r-9')).toBe('p:r-9')
  })

  it('se relit tel qu il a ete ecrit, etape comprise', async () => {
    await ecrireBrouillon(brouillon('p:nouveau'))
    const b = await lireBrouillon('p:nouveau', 'chef', MAINTENANT)
    expect(b?.indice).toBe(4)
    expect(b?.etat.effectifOuvriers).toBe('12')
  })

  it('n est pas propose a un autre utilisateur du meme telephone', async () => {
    await ecrireBrouillon(brouillon('p2:nouveau', 'chef'))
    expect(await lireBrouillon('p2:nouveau', 'autre-chef', MAINTENANT)).toBeNull()
  })

  it('disparait une fois efface', async () => {
    await ecrireBrouillon(brouillon('p3:nouveau'))
    await effacerBrouillon('p3:nouveau')
    expect(await lireBrouillon('p3:nouveau', 'chef', MAINTENANT)).toBeNull()
  })

  it('n est plus propose apres deux semaines', async () => {
    await ecrireBrouillon(brouillon('p4:nouveau', 'chef', MAINTENANT - DUREE_VIE_BROUILLON_MS - 1))
    expect(await lireBrouillon('p4:nouveau', 'chef', MAINTENANT)).toBeNull()
  })
})
