/**
 * Ecriture et controle d'un fichier GLB (glTF 2.0 binaire).
 *
 * La maquette IFC est convertie a l'import en GLB : un format compact, lu
 * directement par la visionneuse, sans le moteur IFC de plusieurs
 * mega-octets. Chaque element de la maquette devient un noeud nomme par son
 * GlobalId IFC : c'est par ce nom que la visionneuse retrouve l'element et
 * le colore selon l'etat de ses taches.
 *
 * Ecrivain minimal et pur, sans dependance : sommets, normales, indices, un
 * materiau neutre. Les couleurs sont posees a l'affichage.
 */

export type Maillage = {
  /** GlobalId IFC de l'element. */
  nom: string
  /** x, y, z a la suite, en metres, axe Y vertical (convention glTF). */
  positions: Float32Array
  normales: Float32Array
  indices: Uint32Array
  /** Donnees libres du noeud, ecrites dans `extras` : l'inventaire de l'element. */
  extras?: Record<string, unknown>
}

const MAGIC = 0x46546c67 // « glTF »
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const FLOAT = 5126
const UNSIGNED_SHORT = 5123
const UNSIGNED_INT = 5125

const aligner4 = (n: number) => (n + 3) & ~3

function bornes(p: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < p.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = p[i + k] as number
      if (v < (min[k] as number)) min[k] = v
      if (v > (max[k] as number)) max[k] = v
    }
  }
  return { min, max }
}

export function ecrireGlb(
  maillages: readonly Maillage[],
  /** Donnees libres de la scene, ecrites dans `extras`. */
  extrasScene?: Record<string, unknown>,
): Uint8Array {
  const morceaux: Uint8Array[] = []
  const bufferViews: object[] = []
  const accessors: object[] = []
  const meshes: object[] = []
  const nodes: object[] = []
  let decalage = 0

  const ajouter = (octets: Uint8Array, cible: number): number => {
    bufferViews.push({
      buffer: 0,
      byteOffset: decalage,
      byteLength: octets.byteLength,
      target: cible,
    })
    morceaux.push(octets)
    const rembourrage = aligner4(octets.byteLength) - octets.byteLength
    if (rembourrage > 0) morceaux.push(new Uint8Array(rembourrage))
    decalage += octets.byteLength + rembourrage
    return bufferViews.length - 1
  }

  for (const m of maillages) {
    const n = m.positions.length / 3
    if (n === 0 || m.indices.length === 0) continue
    const vp = ajouter(
      new Uint8Array(m.positions.buffer, m.positions.byteOffset, m.positions.byteLength),
      ARRAY_BUFFER,
    )
    accessors.push({
      bufferView: vp,
      componentType: FLOAT,
      count: n,
      type: 'VEC3',
      ...bornes(m.positions),
    })
    const ap = accessors.length - 1
    const vn = ajouter(
      new Uint8Array(m.normales.buffer, m.normales.byteOffset, m.normales.byteLength),
      ARRAY_BUFFER,
    )
    accessors.push({ bufferView: vn, componentType: FLOAT, count: n, type: 'VEC3' })
    const an = accessors.length - 1
    // Indices sur 16 bits quand ils suffisent : la moitie du poids.
    const court = n <= 0xffff
    const indices = court ? Uint16Array.from(m.indices) : m.indices
    const vi = ajouter(
      new Uint8Array(indices.buffer, indices.byteOffset, indices.byteLength),
      ELEMENT_ARRAY_BUFFER,
    )
    accessors.push({
      bufferView: vi,
      componentType: court ? UNSIGNED_SHORT : UNSIGNED_INT,
      count: indices.length,
      type: 'SCALAR',
    })
    meshes.push({
      primitives: [
        { attributes: { POSITION: ap, NORMAL: an }, indices: accessors.length - 1, material: 0 },
      ],
    })
    nodes.push({ name: m.nom, mesh: meshes.length - 1, ...(m.extras ? { extras: m.extras } : {}) })
  }

  const json = {
    asset: { version: '2.0', generator: 'ChantierScope' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i), ...(extrasScene ? { extras: extrasScene } : {}) }],
    nodes,
    meshes,
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.8, 0.8, 0.8, 1],
          metallicFactor: 0,
          roughnessFactor: 0.9,
        },
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: decalage }],
  }
  let texte = new TextEncoder().encode(JSON.stringify(json))
  // Le morceau JSON est complete d'espaces jusqu'a un multiple de quatre.
  const longueurJson = aligner4(texte.byteLength)
  if (longueurJson !== texte.byteLength) {
    const t = new Uint8Array(longueurJson).fill(0x20)
    t.set(texte)
    texte = t
  }
  const total = 12 + 8 + longueurJson + 8 + decalage
  const sortie = new Uint8Array(total)
  const v = new DataView(sortie.buffer)
  v.setUint32(0, MAGIC, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, total, true)
  v.setUint32(12, longueurJson, true)
  v.setUint32(16, CHUNK_JSON, true)
  sortie.set(texte, 20)
  let o = 20 + longueurJson
  v.setUint32(o, decalage, true)
  v.setUint32(o + 4, CHUNK_BIN, true)
  o += 8
  for (const m of morceaux) {
    sortie.set(m, o)
    o += m.byteLength
  }
  return sortie
}

export type ContenuGlb = {
  noeuds: { nom: string; extras: unknown }[]
  extrasScene: unknown
}

/**
 * Lecture d'un GLB recu : signature, version 2, longueur annoncee egale a la
 * longueur reelle, morceau JSON lisible. Rend les noeuds et les donnees de
 * la scene, ou null si le fichier n'est pas un GLB valide.
 */
export function lireGlb(o: Uint8Array): ContenuGlb | null {
  if (o.byteLength < 28) return null
  const v = new DataView(o.buffer, o.byteOffset, o.byteLength)
  if (v.getUint32(0, true) !== MAGIC || v.getUint32(4, true) !== 2) return null
  if (v.getUint32(8, true) !== o.byteLength) return null
  const lj = v.getUint32(12, true)
  if (v.getUint32(16, true) !== CHUNK_JSON || 20 + lj > o.byteLength) return null
  try {
    const json = JSON.parse(new TextDecoder().decode(o.subarray(20, 20 + lj))) as {
      asset?: { version?: string }
      nodes?: { name?: unknown; extras?: unknown }[]
      scenes?: { extras?: unknown }[]
    }
    if (json.asset?.version !== '2.0') return null
    return {
      noeuds: (json.nodes ?? []).map((n) => ({ nom: String(n.name ?? ''), extras: n.extras })),
      extrasScene: json.scenes?.[0]?.extras,
    }
  } catch {
    return null
  }
}

/** Controle seul : nombre de noeuds, ou null. */
export function controlerGlb(o: Uint8Array): { noeuds: number } | null {
  const c = lireGlb(o)
  return c && { noeuds: c.noeuds.length }
}
