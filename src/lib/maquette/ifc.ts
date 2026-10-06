/**
 * Extraction d'une maquette IFC : geometrie de chaque element, inventaire
 * (classe, nom, etage) et etages, a partir du moteur web-ifc.
 *
 * Le moteur est fourni deja initialise par l'appelant : dans le navigateur,
 * avec l'adresse de son module WebAssembly ; sous Node, pour les tests et le
 * peuplement, tel quel. Ce module ne depend ainsi d'aucun des deux.
 *
 * L'IFC a l'axe Z vertical, le glTF l'axe Y : la geometrie est tournee a
 * l'extraction, une fois pour toutes.
 */

import type { IfcAPI } from 'web-ifc'
import { ecrireGlb, type Maillage } from '@/lib/maquette/glb'

export type Etage = { nom: string; altitude: number; niveau: number }

export type ElementMaquette = {
  globalId: string
  /** Classe IFC en majuscules, par exemple IFCWALL. */
  classe: string
  nom: string | null
  /** Nom de l'etage qui contient l'element, ou null s'il n'est rattache a aucun. */
  etage: string | null
}

export type MaquetteExtraite = {
  schema: string
  etages: Etage[]
  elements: ElementMaquette[]
  maillages: Maillage[]
}

// Codes de type IFC, repris de web-ifc (constantes stables du schema).
const IFCBUILDINGSTOREY = 3124254112
const IFCRELCONTAINEDINSPATIALSTRUCTURE = 3242617779
const IFCRELAGGREGATES = 160246688

/** Au-dela, la maquette n'est plus un batiment mais un quartier : refusee. */
export const ELEMENTS_MAX = 50_000

type Ligne = Record<string, { value?: unknown } | { value?: unknown }[] | undefined>

const valeur = (l: Ligne, champ: string): unknown =>
  (l[champ] as { value?: unknown } | undefined)?.value
const liste = (l: Ligne, champ: string): number[] =>
  ((l[champ] as { value?: unknown }[] | undefined) ?? []).map((r) => Number(r.value))

function ids(api: IfcAPI, modele: number, type: number): number[] {
  const v = api.GetLineIDsWithType(modele, type)
  const r: number[] = []
  for (let i = 0; i < v.size(); i++) r.push(v.get(i))
  return r
}

/**
 * Niveau de chaque etage : 0 pour le rez-de-chaussee, puis +1, +2 en
 * montant, -1 en descendant. Le rez-de-chaussee est l'etage nomme comme tel,
 * a defaut celui dont l'altitude est la plus proche de zero. Les noms
 * d'etage varient d'un bureau d'etudes a l'autre ; leur ordre, non.
 */
export function niveauxEtages(etages: readonly { nom: string; altitude: number }[]): Etage[] {
  const tries = [...etages].sort((a, b) => a.altitude - b.altitude)
  const nomme = tries.findIndex((e) => /^(rdc|rez)/i.test(e.nom.trim()))
  let ref = nomme
  if (ref < 0) {
    ref = 0
    tries.forEach((e, i) => {
      if (Math.abs(e.altitude) < Math.abs((tries[ref] as { altitude: number }).altitude)) ref = i
    })
  }
  return tries.map((e, i) => ({ ...e, niveau: i - ref }))
}

export function extraireMaquette(api: IfcAPI, octets: Uint8Array): MaquetteExtraite {
  const modele = api.OpenModel(octets)
  try {
    const schema = api.GetModelSchema(modele)

    // Etages et contenance : element -> etage, y compris les parties d'un
    // element compose (volee d'un escalier), qui heritent de leur parent.
    const nomEtage = new Map<number, string>()
    const brutsEtages: { nom: string; altitude: number }[] = []
    for (const id of ids(api, modele, IFCBUILDINGSTOREY)) {
      const l = api.GetLine(modele, id) as Ligne
      const nom = String(valeur(l, 'Name') ?? `Étage ${id}`)
      nomEtage.set(id, nom)
      brutsEtages.push({ nom, altitude: Number(valeur(l, 'Elevation') ?? 0) })
    }
    const etageDe = new Map<number, string>()
    for (const id of ids(api, modele, IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      const l = api.GetLine(modele, id) as Ligne
      const etage = nomEtage.get(Number(valeur(l, 'RelatingStructure')))
      if (etage === undefined) continue
      for (const e of liste(l, 'RelatedElements')) etageDe.set(e, etage)
    }
    for (const id of ids(api, modele, IFCRELAGGREGATES)) {
      const l = api.GetLine(modele, id) as Ligne
      const etage = etageDe.get(Number(valeur(l, 'RelatingObject')))
      if (etage === undefined) continue
      for (const e of liste(l, 'RelatedObjects')) if (!etageDe.has(e)) etageDe.set(e, etage)
    }

    const elements: ElementMaquette[] = []
    const maillages: Maillage[] = []
    api.StreamAllMeshes(modele, (m) => {
      if (elements.length >= ELEMENTS_MAX) return
      const pos: number[] = []
      const nor: number[] = []
      const ind: number[] = []
      for (let i = 0; i < m.geometries.size(); i++) {
        const pg = m.geometries.get(i)
        const g = api.GetGeometry(modele, pg.geometryExpressID)
        const sommets = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize())
        const index = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize())
        const t = pg.flatTransformation
        const base = pos.length / 3
        for (let k = 0; k < sommets.length; k += 6) {
          const x = sommets[k] as number
          const y = sommets[k + 1] as number
          const z = sommets[k + 2] as number
          const nx = sommets[k + 3] as number
          const ny = sommets[k + 4] as number
          const nz = sommets[k + 5] as number
          // Matrice 4 x 4 en colonnes ; web-ifc la donne deja en Y vertical.
          pos.push(
            (t[0] as number) * x + (t[4] as number) * y + (t[8] as number) * z + (t[12] as number),
            (t[1] as number) * x + (t[5] as number) * y + (t[9] as number) * z + (t[13] as number),
            (t[2] as number) * x + (t[6] as number) * y + (t[10] as number) * z + (t[14] as number),
          )
          nor.push(
            (t[0] as number) * nx + (t[4] as number) * ny + (t[8] as number) * nz,
            (t[1] as number) * nx + (t[5] as number) * ny + (t[9] as number) * nz,
            (t[2] as number) * nx + (t[6] as number) * ny + (t[10] as number) * nz,
          )
        }
        for (const v of index) ind.push(base + v)
        g.delete()
      }
      if (ind.length === 0) return
      const l = api.GetLine(modele, m.expressID) as Ligne
      const globalId = String(valeur(l, 'GlobalId') ?? `#${m.expressID}`)
      const nom = valeur(l, 'Name')
      const element: ElementMaquette = {
        globalId,
        classe: api.GetNameFromTypeCode(api.GetLineType(modele, m.expressID)).toUpperCase(),
        nom: typeof nom === 'string' && nom.trim() !== '' ? nom.trim().slice(0, 200) : null,
        etage: etageDe.get(m.expressID) ?? null,
      }
      elements.push(element)
      maillages.push({
        nom: globalId,
        // L'inventaire voyage dans le GLB : le serveur le relit du fichier
        // depose, sans second envoi.
        extras: { classe: element.classe, nom: element.nom, etage: element.etage },
        positions: new Float32Array(pos),
        normales: new Float32Array(nor),
        indices: new Uint32Array(ind),
      })
    })

    return { schema, etages: niveauxEtages(brutsEtages), elements, maillages }
  } finally {
    api.CloseModel(modele)
  }
}

/** GLB d'une maquette extraite : geometrie, inventaire et etages dans le meme fichier. */
export function glbMaquette(m: MaquetteExtraite): Uint8Array {
  return ecrireGlb(m.maillages, { schema: m.schema, etages: m.etages })
}
