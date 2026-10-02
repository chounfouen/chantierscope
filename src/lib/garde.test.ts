import { describe, expect, it } from 'vitest'
import {
  NonAutorise,
  actionsSurReleve,
  verifierAcces,
  LIBELLE_ROLE,
  PEUT_ADMINISTRER,
  PEUT_LIRE,
  PEUT_OUVRIR_NON_CONFORMITE,
  PEUT_PLANIFIER,
  PEUT_SAISIR,
  PEUT_VALIDER,
  VOIT_DONNEES_INTERNES,
  voitDonneesInternes,
} from '@/lib/droits'
import type { Role } from '@/db/schema'

const TOUS: Role[] = ['CHEF_CHANTIER', 'CONDUCTEUR', 'MOE', 'MOA', 'ADMIN']

describe('matrice des droits', () => {
  it('tous les roles peuvent lire', () => {
    for (const r of TOUS) expect(PEUT_LIRE).toContain(r)
  })

  it('seuls le chef de chantier, le conducteur et l administration saisissent', () => {
    expect([...PEUT_SAISIR].sort()).toEqual(['ADMIN', 'CHEF_CHANTIER', 'CONDUCTEUR'])
  })

  it('le chef de chantier ne valide pas ses propres releves', () => {
    // Separation des roles : celui qui saisit n est pas celui qui engage.
    expect(PEUT_SAISIR).toContain('CHEF_CHANTIER')
    expect(PEUT_VALIDER).not.toContain('CHEF_CHANTIER')
  })

  it('la maitrise d oeuvre ne saisit pas et ne valide pas', () => {
    expect(PEUT_SAISIR).not.toContain('MOE')
    expect(PEUT_VALIDER).not.toContain('MOE')
  })

  it('la maitrise d oeuvre peut ouvrir une non-conformite', () => {
    expect(PEUT_OUVRIR_NON_CONFORMITE).toContain('MOE')
  })

  it('la maitrise d ouvrage ne peut qu observer', () => {
    for (const droit of [
      PEUT_SAISIR,
      PEUT_VALIDER,
      PEUT_PLANIFIER,
      PEUT_OUVRIR_NON_CONFORMITE,
      PEUT_ADMINISTRER,
    ]) {
      expect(droit).not.toContain('MOA')
    }
    expect(PEUT_LIRE).toContain('MOA')
  })

  it('seule l administration administre', () => {
    expect([...PEUT_ADMINISTRER]).toEqual(['ADMIN'])
  })

  it('l administration cumule tous les droits operationnels', () => {
    for (const droit of [PEUT_LIRE, PEUT_SAISIR, PEUT_VALIDER, PEUT_PLANIFIER]) {
      expect(droit).toContain('ADMIN')
    }
  })
})

describe('donnees internes a l entreprise', () => {
  it('la maitrise d ouvrage ne voit pas les donnees internes', () => {
    // Le maitre d ouvrage suit son operation ; il n a pas a connaitre le prix
    // de revient de l entreprise ni la taille de ses equipes.
    expect(voitDonneesInternes('MOA')).toBe(false)
    expect(VOIT_DONNEES_INTERNES).not.toContain('MOA')
  })

  it('les quatre autres roles les voient', () => {
    for (const r of ['CHEF_CHANTIER', 'CONDUCTEUR', 'MOE', 'ADMIN'] as const) {
      expect(voitDonneesInternes(r)).toBe(true)
    }
  })
})

describe('libelles de role', () => {
  it('chaque role porte un libelle lisible', () => {
    for (const r of TOUS) {
      expect(LIBELLE_ROLE[r]).toBeTruthy()
      expect(LIBELLE_ROLE[r]).not.toBe(r)
    }
  })

  it('les libelles sont distincts', () => {
    expect(new Set(Object.values(LIBELLE_ROLE)).size).toBe(TOUS.length)
  })
})

describe('verification d acces', () => {
  const utilisateur = (role: Role, projetIds: string[] = ['p1']) => ({
    id: 'u1',
    nom: 'Test',
    email: 't@test',
    role,
    projetIds,
  })

  it('laisse passer un role habilite rattache au projet', () => {
    expect(() => verifierAcces(utilisateur('CONDUCTEUR'), 'p1', PEUT_VALIDER)).not.toThrow()
  })

  it('refuse un role non habilite', () => {
    expect(() => verifierAcces(utilisateur('MOA'), 'p1', PEUT_VALIDER)).toThrow(NonAutorise)
  })

  it('nomme le role refuse dans le message', () => {
    try {
      verifierAcces(utilisateur('MOA'), 'p1', PEUT_VALIDER)
      expect.unreachable('l acces aurait du etre refuse')
    } catch (e) {
      expect((e as Error).message).toContain('MOA')
    }
  })

  it('refuse un projet non rattache, meme a un role habilite', () => {
    // Un conducteur de travaux d une autre operation n a rien a voir ici.
    expect(() => verifierAcces(utilisateur('CONDUCTEUR', ['p2']), 'p1', PEUT_VALIDER)).toThrow(
      /n est pas accessible/,
    )
  })

  it('refuse un utilisateur sans aucun projet', () => {
    expect(() => verifierAcces(utilisateur('ADMIN', []), 'p1', PEUT_LIRE)).toThrow(NonAutorise)
  })

  it('verifie le role AVANT le rattachement', () => {
    // L ordre importe : le message doit designer la cause la plus generale,
    // pour ne pas reveler qu un projet existe a qui n a pas le droit de lire.
    try {
      verifierAcces(utilisateur('MOA', ['p2']), 'p1', PEUT_VALIDER)
      expect.unreachable('l acces aurait du etre refuse')
    } catch (e) {
      expect((e as Error).message).toContain('n est pas habilite')
    }
  })

  it('chaque role peut lire le projet auquel il est rattache', () => {
    for (const r of TOUS) {
      expect(() => verifierAcces(utilisateur(r), 'p1', PEUT_LIRE)).not.toThrow()
    }
  })

  it('les droits par defaut sont ceux de lecture', () => {
    expect(() => verifierAcces(utilisateur('MOA'), 'p1', PEUT_LIRE)).not.toThrow()
  })
})

describe('circuit de validation d un releve', () => {
  it('le chef de chantier modifie et soumet son brouillon, sans le valider', () => {
    expect(actionsSurReleve('BROUILLON', 'CHEF_CHANTIER')).toEqual(['modifier', 'soumettre'])
    expect(actionsSurReleve('SOUMIS', 'CHEF_CHANTIER')).toEqual(['modifier'])
  })

  it('le conducteur valide un releve soumis', () => {
    expect(actionsSurReleve('SOUMIS', 'CONDUCTEUR')).toEqual(['modifier', 'valider'])
  })

  it('un brouillon ne se valide pas sans avoir ete soumis', () => {
    for (const r of TOUS) expect(actionsSurReleve('BROUILLON', r)).not.toContain('valider')
  })

  it('un releve valide est gele : personne ne le modifie', () => {
    for (const r of TOUS) expect(actionsSurReleve('VALIDE', r)).not.toContain('modifier')
  })

  it('seuls les roles qui valident rectifient un releve valide', () => {
    const rectifient = TOUS.filter((r) => actionsSurReleve('VALIDE', r).includes('rectifier'))
    expect(rectifient.sort()).toEqual([...PEUT_VALIDER].sort())
  })

  it('un releve rectifie n admet plus aucune action', () => {
    for (const r of TOUS) expect(actionsSurReleve('RECTIFIE', r)).toEqual([])
  })

  it('la maitrise d oeuvre et la maitrise d ouvrage n agissent jamais sur un releve', () => {
    for (const statut of ['BROUILLON', 'SOUMIS', 'VALIDE', 'RECTIFIE'] as const) {
      expect(actionsSurReleve(statut, 'MOE')).toEqual([])
      expect(actionsSurReleve(statut, 'MOA')).toEqual([])
    }
  })
})
