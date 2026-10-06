/**
 * Inventaire d'une maquette relu dans son GLB, par le serveur.
 *
 * Le navigateur ecrit l'inventaire dans le fichier ; le serveur ne le croit
 * pas sur parole pour autant : chaque champ est valide et borne avant
 * d'entrer en base.
 */

import { z } from 'zod'
import { lireGlb } from '@/lib/maquette/glb'
import { ELEMENTS_MAX, type ElementMaquette, type Etage } from '@/lib/maquette/ifc'

const Texte = (max: number) => z.string().trim().min(1).max(max)

const Scene = z.object({
  schema: Texte(40),
  etages: z
    .array(
      z.object({
        nom: Texte(120),
        altitude: z.number().finite(),
        niveau: z.number().int().min(-50).max(500),
      }),
    )
    .max(200),
})

const Noeud = z.object({
  nom: Texte(64),
  extras: z.object({
    classe: z
      .string()
      .regex(/^IFC[A-Z0-9]+$/)
      .max(64),
    nom: z.string().max(200).nullable(),
    etage: z.string().max(120).nullable(),
  }),
})

export type Inventaire = { schema: string; etages: Etage[]; elements: ElementMaquette[] }

/** Inventaire valide du GLB, ou le motif du refus. */
export function inventaireGlb(o: Uint8Array): Inventaire | { refus: string } {
  const c = lireGlb(o)
  if (c === null) return { refus: 'Le fichier déposé n’est pas une maquette valide.' }
  if (c.noeuds.length === 0) return { refus: 'La maquette ne contient aucun élément dessinable.' }
  if (c.noeuds.length > ELEMENTS_MAX) {
    return { refus: `Maquette trop grande : ${ELEMENTS_MAX} éléments au plus.` }
  }
  const scene = Scene.safeParse(c.extrasScene)
  if (!scene.success) return { refus: 'Étages de la maquette illisibles.' }
  const elements: ElementMaquette[] = []
  const vus = new Set<string>()
  for (const n of c.noeuds) {
    const e = Noeud.safeParse(n)
    if (!e.success) return { refus: 'Inventaire de la maquette illisible.' }
    if (vus.has(e.data.nom)) continue
    vus.add(e.data.nom)
    elements.push({
      globalId: e.data.nom,
      classe: e.data.extras.classe,
      nom: e.data.extras.nom,
      etage: e.data.extras.etage,
    })
  }
  return { schema: scene.data.schema, etages: scene.data.etages, elements }
}
