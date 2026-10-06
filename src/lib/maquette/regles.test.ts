import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { IfcAPI } from 'web-ifc'
import { beforeAll, describe, expect, it } from 'vitest'
import { familleOuvrage } from '@/db/schema'
import { extraireMaquette } from '@/lib/maquette/ifc'
import {
  classer,
  famille,
  FAMILLES,
  familleDansNom,
  groupes,
  motOriginal,
  niveauDansNom,
  proposerRegles,
  tachesParElement,
  type ElementClasse,
} from '@/lib/maquette/regles'

/** Taches elementaires du chantier de demonstration, code et nom. */
const TACHES = `01.1.1 Aménagement des accès et clôture de chantier
01.1.4 Montage et essais de la grue à tour
02.1.2 Fouilles en pleine masse
02.1.4 Remblais compactés et plateforme
03.1.1 Béton de propreté
03.1.2 Semelles isolées sous poteaux
03.1.3 Semelles filantes
03.1.4 Longrines et amorces de poteaux
03.1.5 Dallage sur terre-plein
04.1.1 Poteaux du rez-de-chaussée
04.1.2 Voiles et cage d’escalier du rez-de-chaussée
04.1.3 Plancher haut du rez-de-chaussée
04.2.1 Poteaux du R+1
04.2.2 Voiles et cage d’escalier du R+1
04.2.3 Plancher haut du R+1
04.3.2 Voiles et cage d’escalier du R+2
04.4.1 Poteaux du R+3
04.4.3 Plancher haut du R+3 et terrasse
04.5.1 Maçonnerie d’agglomérés
04.5.2 Escaliers en béton armé
04.5.3 Acrotères et couronnement
05.1.1 Charpente métallique de la toiture
05.1.2 Couverture en bacs acier
05.1.3 Étanchéité des terrasses accessibles
06.1.1 Cloisons de distribution
06.1.5 Carrelage et faïence
06.2.1 Menuiseries extérieures en aluminium
06.2.2 Menuiseries intérieures en bois
06.2.3 Serrurerie et garde-corps
07.1.3 Appareils sanitaires
08.2.3 Clôture définitive et portail`
  .split('\n')
  .map((l) => ({ id: l.slice(0, 6), nom: l.slice(7) }))

let elements: ElementClasse[]

beforeAll(async () => {
  const api = new IfcAPI()
  await api.Init()
  const m = extraireMaquette(
    api,
    new Uint8Array(
      readFileSync(resolve(import.meta.dirname, '../../db/seed/residence-palmiers.ifc')),
    ),
  )
  elements = classer(m.elements, m.etages)
}, 30_000)

describe('familles et niveaux', () => {
  it('a les memes familles que l enumeration de la base', () => {
    expect(Object.keys(FAMILLES)).toEqual(familleOuvrage.enumValues)
  })

  it('range les classes IFC en familles d ouvrages', () => {
    expect(famille('IfcWallStandardCase')).toBe('MURS')
    expect(famille('IFCSTAIRFLIGHT')).toBe('ESCALIERS')
    expect(famille('IFCSANITARYTERMINAL')).toBe('EQUIPEMENTS')
    expect(famille('IFCFURNISHINGELEMENT')).toBe('AUTRES')
  })

  it('lit le niveau cite dans un nom de tache', () => {
    expect(niveauDansNom('Poteaux du rez-de-chaussée')).toBe(0)
    expect(niveauDansNom('Voiles du R+2')).toBe(2)
    expect(niveauDansNom('Parking du sous-sol 2')).toBe(-2)
    expect(niveauDansNom('Serrurerie et garde-corps')).toBeNull()
  })

  it('rend le mot tel qu il s ecrit dans le nom, accents compris', () => {
    expect(motOriginal('Semelle isolée P1A', 'isolee')).toBe('isolée')
    expect(motOriginal('Mur en agglomérés', 'agglomere')).toBe('aggloméré')
    expect(motOriginal('Voile', 'absent')).toBe('absent')
  })

  it('retient le premier mot qui designe une famille', () => {
    expect(familleDansNom('Voiles et cage d’escalier du R+2')?.famille).toBe('MURS')
    expect(familleDansNom('Longrines et amorces de poteaux')?.famille).toBe('POUTRES')
    expect(familleDansNom('Semelles isolées sous poteaux')?.famille).toBe('FONDATIONS')
    expect(familleDansNom('Béton de propreté')).toBeNull()
  })
})

describe('propositions sur la maquette de demonstration', () => {
  it('propose la regle attendue pour chaque tache, et aucune ailleurs', () => {
    const p = proposerRegles(TACHES, elements)
    const vues = Object.fromEntries(
      p.map((r) => [r.tacheId, [r.famille, r.niveau, r.nomContient, r.elements]]),
    )
    expect(vues).toEqual({
      '03.1.2': ['FONDATIONS', null, 'isolée', 15],
      '03.1.3': ['FONDATIONS', null, 'filante', 4],
      '03.1.4': ['POUTRES', null, 'longrine', 3],
      '03.1.5': ['DALLES', null, 'dallage', 1],
      '04.1.1': ['POTEAUX', 0, null, 15],
      '04.1.2': ['MURS', 0, 'voile', 8],
      '04.1.3': ['DALLES', 1, null, 1],
      '04.2.1': ['POTEAUX', 1, null, 15],
      '04.2.2': ['MURS', 1, 'voile', 8],
      '04.2.3': ['DALLES', 2, null, 1],
      '04.3.2': ['MURS', 2, 'voile', 8],
      '04.4.1': ['POTEAUX', 3, null, 15],
      '04.4.3': ['DALLES', 4, null, 1],
      '04.5.1': ['MURS', null, 'aggloméré', 16],
      '04.5.2': ['ESCALIERS', null, null, 4],
      '04.5.3': ['MURS', null, 'acrotère', 4],
      '05.1.1': ['POUTRES', null, 'charpente', 5],
      '05.1.2': ['TOITURE', null, null, 1],
      '06.1.1': ['MURS', null, 'cloison', 32],
      '06.2.1': ['MENUISERIES', null, 'aluminium', 64],
      '06.2.2': ['MENUISERIES', null, 'bois', 32],
      '06.2.3': ['GARDE_CORPS', null, null, 12],
    })
  })

  it('ne repropose pas une tache deja rattachee', () => {
    expect(
      proposerRegles(TACHES, elements, new Set(['04.1.1'])).some((r) => r.tacheId === '04.1.1'),
    ).toBe(false)
  })

  it('donne a chaque element ses taches, et regroupe les elements de memes taches', () => {
    const regles = proposerRegles(TACHES, elements)
    const parElement = tachesParElement(elements, regles)
    // Les voiles du R+2 relevent d'une seule tache, les fenetres d'une autre.
    const voile = elements.find((e) => e.nom === 'Voile de façade nord R+2')
    expect(parElement.get(voile?.globalId ?? '')).toEqual(['04.3.2'])
    const { groupes: g, groupeDe } = groupes(parElement)
    expect(g).toHaveLength(22)
    expect(groupeDe.get(voile?.globalId ?? '')).toBe('04.3.2')
    // Les poteaux du R+2 n'ont pas de tache dans cette liste : non colores.
    const poteau = elements.find((e) => e.nom === 'Poteau P1A R+2')
    expect(parElement.has(poteau?.globalId ?? '')).toBe(false)
  })
})
