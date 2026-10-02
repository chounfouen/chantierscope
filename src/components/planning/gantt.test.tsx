/**
 * Rendu du Gantt, sans navigateur.
 *
 * Deux exigences du sprint 6 :
 *   - le chemin critique AFFICHE est celui du calcul manuel du sprint 2 ;
 *   - le rendu de deux cents taches tient sous 500 millisecondes.
 */

import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Gantt } from '@/components/planning/gantt'
import { calculerReseau } from '@/db/compute/cpm'
import { ATTENDU_REFERENCE } from '@/db/compute/reference'
import type { Planning } from '@/db/queries/planning'
import { reseauDuPlanning } from '@/db/queries/planning'
import { construireGantt } from '@/lib/gantt-donnees'
import { planningReference } from '@/lib/gantt-reference'

function rendre(p: Planning): string {
  const donnees = construireGantt(p, calculerReseau(reseauDuPlanning(p)), p.projet.dateOrdreService)
  return renderToString(<Gantt donnees={donnees} grisees={[]} hauteur={4000} />)
}

function attribut(html: string, nom: string, valeur: string): string[] {
  const re = new RegExp(`data-tache="([^"]+)"[^>]*${nom}="${valeur}"`, 'g')
  return [...html.matchAll(re)].map((m) => m[1] as string)
}

describe('rendu du Gantt sur le reseau de reference', () => {
  it('affiche critiques exactement les taches du calcul manuel', () => {
    const html = rendre(planningReference())
    expect(attribut(html, 'data-critique', 'oui').sort()).toEqual(
      [...ATTENDU_REFERENCE.cheminCritique].sort(),
    )
    expect(attribut(html, 'data-critique', 'non').sort()).toEqual(['C', 'E', 'H'])
  })

  it('trace une polyligne par liaison, et six liaisons critiques', () => {
    const html = rendre(planningReference())
    expect(html.match(/<polyline/g)).toHaveLength(11)
    expect(html.match(/url\(#fleche-critique\)/g)).toHaveLength(6)
  })

  it('annonce le diagramme aux lecteurs d ecran', () => {
    expect(rendre(planningReference())).toContain(
      'aria-label="Diagramme de Gantt : 10 tâches, dont 7 critiques"',
    )
  })
})

/** Planning synthetique de deux cents taches en chaine, sur vingt lots de WBS. */
function planningDeDeuxCents(): Planning {
  const base = planningReference()
  const taches: Planning['taches'] = []
  const liaisons: Planning['liaisons'] = []
  for (let n = 0; n < 20; n++) {
    taches.push({
      ...(base.taches[0] as Planning['taches'][number]),
      id: `n${n}`,
      codeWbs: `01.${n + 1}`,
      nom: `Regroupement ${n + 1}`,
    })
  }
  for (let i = 0; i < 200; i++) {
    taches.push({
      ...(base.taches[1] as Planning['taches'][number]),
      id: `t${i}`,
      parentId: `n${Math.floor(i / 10)}`,
      codeWbs: `01.${Math.floor(i / 10) + 1}.${(i % 10) + 1}`,
      nom: `Tache ${i}`,
      dureePrevueJ: 3 + (i % 7),
    })
    if (i > 0) {
      liaisons.push({
        id: `l${i}`,
        amontId: `t${i - 1}`,
        avalId: `t${i}`,
        type: 'FD',
        decalageJ: 0,
      })
    }
    if (i > 10) {
      liaisons.push({
        id: `m${i}`,
        amontId: `t${i - 10}`,
        avalId: `t${i}`,
        type: 'DD',
        decalageJ: 2,
      })
    }
  }
  return { ...base, taches, liaisons, jalons: [] }
}

describe('performance', () => {
  it('construit et rend deux cents taches sous 500 millisecondes', () => {
    const p = planningDeDeuxCents()
    rendre(p) // Echauffement : le premier rendu compile le module.
    const debut = performance.now()
    const html = rendre(p)
    const duree = performance.now() - debut
    expect(html).toContain('dont')
    expect(duree).toBeLessThan(500)
  })
})
