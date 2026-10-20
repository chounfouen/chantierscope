/**
 * Metre de la maquette, et sa comparaison au quantitatif du marche.
 *
 * Le volume d'un element se lit, par ordre de preference :
 *   1. dans ses quantites IFC (IfcElementQuantity), volume net puis brut,
 *      quand le bureau d'etudes les a exportees ;
 *   2. a defaut, dans sa geometrie : le volume d'un maillage ferme est la
 *      somme des volumes signes des tetraedres qu'il forme avec l'origine
 *      (theoreme de flux). Un maillage ouvert donne un volume sans valeur :
 *      la source est indiquee pour que le lecteur juge.
 *
 * La comparaison porte sur le beton, la ou le metre fait l'argent : pour
 * chaque tache rattachee a la maquette, le volume des elements qu'elle
 * couvre face aux lignes de beton en m3 de son quantitatif. Un element
 * rattache a deux taches compte pour chacune.
 *
 * Module pur, partage par le navigateur (extraction) et le serveur.
 */

export type SourceQuantite = 'QTO' | 'GEOMETRIE'

/** Volume d'un maillage triangule, en unites du modele au cube. */
export function volumeMaillage(positions: ArrayLike<number>, indices: ArrayLike<number>): number {
  let v = 0
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = 3 * (indices[i] as number)
    const b = 3 * (indices[i + 1] as number)
    const c = 3 * (indices[i + 2] as number)
    const ax = positions[a] as number
    const ay = positions[a + 1] as number
    const az = positions[a + 2] as number
    const bx = positions[b] as number
    const by = positions[b + 1] as number
    const bz = positions[b + 2] as number
    const cx = positions[c] as number
    const cy = positions[c + 1] as number
    const cz = positions[c + 2] as number
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return Math.abs(v) / 6
}

/** Quantite IFC preferee parmi celles d'un element : volume net, puis brut. */
export function volumeQto(quantites: readonly { nom: string; volume: number }[]): number | null {
  const ordre = (n: string) => (/net/i.test(n) ? 0 : /gross|brut/i.test(n) ? 1 : 2)
  const tri = [...quantites].filter((q) => q.volume > 0).sort((x, y) => ordre(x.nom) - ordre(y.nom))
  return tri[0]?.volume ?? null
}

export type LigneMetree = {
  tacheId: string
  codeWbs: string
  tache: string
  /** Volume de la maquette, en m3, ou nul si aucun element n'est rattache. */
  maquetteM3: number | null
  elements: number
  /** Quantite de beton prevue au quantitatif, en m3, ou nulle sans ligne de beton. */
  quantitatifM3: number | null
  /** Ecart relatif de la maquette au quantitatif, ou nul faute de l'un des deux. */
  ecart: number | null
  source: SourceQuantite | 'MIXTE' | null
}

/**
 * Familles d'ouvrages en beton coule en place. Une tache rattachee a l'une
 * d'elles et sans ligne de beton au quantitatif est un oubli probable ; une
 * menuiserie sans ligne de beton est dans l'ordre des choses.
 */
export const FAMILLES_BETON: ReadonlySet<string> = new Set([
  'FONDATIONS',
  'POTEAUX',
  'DALLES',
  'ESCALIERS',
])

/** Au-dela de cet ecart, le metre merite d'etre repris avant le decompte. */
export const SEUIL_ECART_METRE = 0.05

export function comparerMetre(p: {
  taches: readonly { id: string; codeWbs: string; nom: string; betonM3: number | null }[]
  elements: readonly { globalId: string; volumeM3: number | null; source: SourceQuantite | null }[]
  tachesParElement: ReadonlyMap<string, readonly string[]>
  /** Taches rattachees a une famille en beton : voir `FAMILLES_BETON`. */
  tachesBeton?: ReadonlySet<string>
}): LigneMetree[] {
  const parTache = new Map<string, { volume: number; n: number; sources: Set<SourceQuantite> }>()
  for (const e of p.elements) {
    if (e.volumeM3 === null) continue
    for (const t of p.tachesParElement.get(e.globalId) ?? []) {
      const m = parTache.get(t) ?? { volume: 0, n: 0, sources: new Set<SourceQuantite>() }
      m.volume += e.volumeM3
      m.n += 1
      if (e.source) m.sources.add(e.source)
      parTache.set(t, m)
    }
  }
  return p.taches
    .filter((t) => t.betonM3 !== null || (parTache.has(t.id) && (p.tachesBeton?.has(t.id) ?? true)))
    .map((t) => {
      const m = parTache.get(t.id)
      const maquetteM3 = m ? Math.round(m.volume * 1000) / 1000 : null
      const sources = m ? [...m.sources] : []
      return {
        tacheId: t.id,
        codeWbs: t.codeWbs,
        tache: t.nom,
        maquetteM3,
        elements: m?.n ?? 0,
        quantitatifM3: t.betonM3,
        ecart:
          maquetteM3 !== null && t.betonM3 !== null && t.betonM3 > 0
            ? (maquetteM3 - t.betonM3) / t.betonM3
            : null,
        source: sources.length === 0 ? null : sources.length > 1 ? 'MIXTE' : (sources[0] ?? null),
      }
    })
}
