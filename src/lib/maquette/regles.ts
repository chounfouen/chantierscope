/**
 * Rattachement des taches du planning aux elements de la maquette.
 *
 * Une tache ne se rattache pas element par element : une maquette en compte
 * des milliers. Elle se rattache par une REGLE : une famille d'ouvrages
 * (murs, poteaux, dalles...), un etage, et au besoin un mot du nom des
 * elements. « Voiles et cage d'escalier du R+2 » couvre ainsi les murs du
 * R+2 dont le nom contient « voile ». Les regles appartiennent au projet,
 * pas a la maquette : elles survivent au remplacement de la maquette par
 * une version plus recente.
 *
 * Logique pure : elle se teste sans navigateur ni base.
 */

import type { ElementMaquette, Etage } from '@/lib/maquette/ifc'

export const FAMILLES = {
  MURS: 'Murs et voiles',
  POTEAUX: 'Poteaux',
  POUTRES: 'Poutres et ossatures',
  DALLES: 'Dalles et planchers',
  FONDATIONS: 'Fondations',
  ESCALIERS: 'Escaliers et rampes',
  TOITURE: 'Toiture',
  MENUISERIES: 'Portes et fenêtres',
  GARDE_CORPS: 'Garde-corps',
  REVETEMENTS: 'Revêtements',
  EQUIPEMENTS: 'Équipements techniques',
  AUTRES: 'Autres éléments',
} as const

export type Famille = keyof typeof FAMILLES

const CLASSES: Record<string, Famille> = {
  IFCWALL: 'MURS',
  IFCWALLSTANDARDCASE: 'MURS',
  IFCWALLELEMENTEDCASE: 'MURS',
  IFCCURTAINWALL: 'MURS',
  IFCCOLUMN: 'POTEAUX',
  IFCCOLUMNSTANDARDCASE: 'POTEAUX',
  IFCBEAM: 'POUTRES',
  IFCBEAMSTANDARDCASE: 'POUTRES',
  IFCMEMBER: 'POUTRES',
  IFCMEMBERSTANDARDCASE: 'POUTRES',
  IFCPLATE: 'POUTRES',
  IFCSLAB: 'DALLES',
  IFCSLABSTANDARDCASE: 'DALLES',
  IFCFOOTING: 'FONDATIONS',
  IFCPILE: 'FONDATIONS',
  IFCSTAIR: 'ESCALIERS',
  IFCSTAIRFLIGHT: 'ESCALIERS',
  IFCRAMP: 'ESCALIERS',
  IFCRAMPFLIGHT: 'ESCALIERS',
  IFCROOF: 'TOITURE',
  IFCDOOR: 'MENUISERIES',
  IFCDOORSTANDARDCASE: 'MENUISERIES',
  IFCWINDOW: 'MENUISERIES',
  IFCWINDOWSTANDARDCASE: 'MENUISERIES',
  IFCRAILING: 'GARDE_CORPS',
  IFCCOVERING: 'REVETEMENTS',
}

export function famille(classe: string): Famille {
  const c = classe.toUpperCase()
  if (CLASSES[c]) return CLASSES[c]
  // Toutes les classes de reseaux (IfcFlowTerminal, IfcPipeSegment...)
  // derivent des « distribution elements » : equipements techniques.
  if (
    /^IFC(FLOW|PIPE|DUCT|CABLE|SANITARY|LIGHT|ELECTRIC|DISTRIBUTION|AIR|VALVE|PUMP|FAN)/.test(c)
  ) {
    return 'EQUIPEMENTS'
  }
  return 'AUTRES'
}

/** Minuscules, sans accents ni apostrophes typographiques. */
export function normaliser(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, ' ')
}

/**
 * Niveau cite dans un nom de tache : « du rez-de-chaussée » vaut 0,
 * « du R+2 » vaut 2, « sous-sol 1 » vaut -1. Null si aucun.
 */
export function niveauDansNom(nom: string): number | null {
  const n = normaliser(nom)
  if (/\b(rez-de-chaussee|rdc)\b/.test(n)) return 0
  const r = /\br\s*\+\s*(\d+)\b/.exec(n)
  if (r) return Number(r[1])
  const s = /\bsous-sol\s*(\d+)?/.exec(n) ?? /\br-(\d+)\b/.exec(n)
  if (s) return -Number(s[1] ?? 1)
  return null
}

export type Regle = {
  tacheId: string
  famille: Famille
  /** Niveau d'etage ; null pour tous les etages. */
  niveau: number | null
  /** Mot que le nom des elements doit contenir ; null pour tous. */
  nomContient: string | null
}

/** Element enrichi de sa famille et du niveau de son etage. */
export type ElementClasse = ElementMaquette & { famille: Famille; niveau: number | null }

export function classer(
  elements: readonly ElementMaquette[],
  etages: readonly Etage[],
): ElementClasse[] {
  const niveaux = new Map(etages.map((e) => [e.nom, e.niveau]))
  return elements.map((e) => ({
    ...e,
    famille: famille(e.classe),
    niveau: e.etage === null ? null : (niveaux.get(e.etage) ?? null),
  }))
}

export function correspond(e: ElementClasse, r: Omit<Regle, 'tacheId'>): boolean {
  if (e.famille !== r.famille) return false
  if (r.niveau !== null && e.niveau !== r.niveau) return false
  if (r.nomContient && !normaliser(e.nom ?? '').includes(normaliser(r.nomContient))) return false
  return true
}

/** Taches de chaque element, dans l'ordre des regles, sans doublon. */
export function tachesParElement(
  elements: readonly ElementClasse[],
  regles: readonly Regle[],
): Map<string, string[]> {
  const r = new Map<string, string[]>()
  for (const e of elements) {
    const t = [...new Set(regles.filter((g) => correspond(e, g)).map((g) => g.tacheId))]
    if (t.length > 0) r.set(e.globalId, t)
  }
  return r
}

/**
 * Groupes d'elements partageant le meme ensemble de taches : l'etat d'un
 * groupe se calcule comme celui d'une zone du plan, une seule fois pour
 * tous ses elements.
 */
export function groupes(parElement: ReadonlyMap<string, string[]>): {
  groupes: { id: string; tacheIds: string[] }[]
  groupeDe: Map<string, string>
} {
  const parCle = new Map<string, string[]>()
  const groupeDe = new Map<string, string>()
  for (const [g, t] of parElement) {
    const cle = [...t].sort().join(',')
    parCle.set(cle, [...t].sort())
    groupeDe.set(g, cle)
  }
  return {
    groupes: [...parCle.entries()].map(([id, tacheIds]) => ({ id, tacheIds })),
    groupeDe,
  }
}

/* -------------------------------------------------------------------------- */
/* Propositions automatiques                                                  */
/* -------------------------------------------------------------------------- */

/** Mots d'un nom de tache qui designent une famille d'ouvrages. */
const MOTS_FAMILLE: [RegExp, Famille][] = [
  [/\b(voiles?|murs?|maconneries?|agglomeres?|cloisons?|acroteres?)\b/, 'MURS'],
  [/\bpoteaux?\b/, 'POTEAUX'],
  [/\b(poutres?|longrines?|charpentes?|pannes?)\b/, 'POUTRES'],
  [/\b(planchers?|dalles?|dallages?)\b/, 'DALLES'],
  [/\b(semelles?|fondations?|pieux)\b/, 'FONDATIONS'],
  [/\b(escaliers?|rampes?)\b/, 'ESCALIERS'],
  [/\b(couvertures?|toitures?)\b/, 'TOITURE'],
  [/\b(menuiseries?|fenetres?|portes?)\b/, 'MENUISERIES'],
  [/\b(garde-corps|serrureries?)\b/, 'GARDE_CORPS'],
  [/\b(carrelages?|faiences?|revetements?)\b/, 'REVETEMENTS'],
]

/**
 * Famille designee par un nom de tache, et le mot qui la designe : le
 * premier mot reconnu l'emporte (« Voiles et cage d'escalier » : murs).
 */
export function familleDansNom(nom: string): { famille: Famille; mot: string } | null {
  const n = normaliser(nom)
  let meilleure: { position: number; famille: Famille; mot: string } | null = null
  for (const [motif, f] of MOTS_FAMILLE) {
    const m = motif.exec(n)
    if (m && (meilleure === null || m.index < meilleure.position)) {
      meilleure = { position: m.index, famille: f, mot: m[0] }
    }
  }
  return meilleure && { famille: meilleure.famille, mot: meilleure.mot }
}

/** Familles qui se repetent a chaque etage : sans etage cite, pas de proposition. */
const PAR_ETAGE: ReadonlySet<Famille> = new Set(['MURS', 'POTEAUX', 'POUTRES', 'DALLES'])

const MOTS_VIDES = new Set(['avec', 'dans', 'pour', 'sous', 'sur', 'des', 'les', 'haut', 'bas'])

/** Mot sans marque du pluriel, pour comparer « voiles » et « Voile de facade ». */
const singulier = (m: string) => (m.length > 4 ? m.replace(/[sx]$/, '') : m)

export type Proposition = Regle & { elements: number }

/**
 * Le mot tel qu'il s'ecrit dans un nom d'element, accents compris : la
 * comparaison se fait sans accents, l'affichage les garde (« isolée »).
 */
export function motOriginal(nom: string, motNormalise: string): string {
  let normalise = ''
  const debutDe: number[] = []
  for (let i = 0; i < nom.length; i++) {
    const n = normaliser(nom[i] as string)
    for (let k = 0; k < n.length; k++) debutDe.push(i)
    normalise += n
  }
  const pos = normalise.indexOf(motNormalise)
  if (pos < 0) return motNormalise
  const debut = debutDe[pos] as number
  const fin = (debutDe[pos + motNormalise.length - 1] as number) + 1
  return nom.slice(debut, fin).toLowerCase()
}

/**
 * Propose une regle par tache, a partir de son nom : famille et etage cites,
 * puis le mot du nom qui distingue, parmi les elements de cette famille et
 * de cet etage, ceux qui la concernent (« voile » distingue les voiles de la
 * maconnerie). Une tache dont la famille n'existe pas dans la maquette n'est
 * pas proposee ; une tache deja rattachee non plus.
 */
export function proposerRegles(
  taches: readonly { id: string; nom: string }[],
  elements: readonly ElementClasse[],
  dejaRattachees: ReadonlySet<string> = new Set(),
): Proposition[] {
  const propositions: Proposition[] = []
  for (const t of taches) {
    if (dejaRattachees.has(t.id)) continue
    const designee = familleDansNom(t.nom)
    if (designee === null) continue
    const f = designee.famille
    let niveau = niveauDansNom(t.nom)
    // Le plancher haut d'un etage est porte par l'etage du dessus.
    if (niveau !== null && f === 'DALLES' && /\bplancher haut\b/.test(normaliser(t.nom)))
      niveau += 1
    const candidats = elements.filter((e) =>
      correspond(e, { famille: f, niveau, nomContient: null }),
    )
    if (candidats.length === 0) continue

    // Mot distinctif : le premier mot du nom, en commencant par celui qui
    // designe la famille, present dans le nom de certains candidats mais
    // pas de tous.
    const autres = normaliser(t.nom)
      .split(/[^a-z0-9-]+/)
      .filter((m) => m.length >= 4 && !MOTS_VIDES.has(m))
    let nomContient: string | null = null
    let retenus = candidats.length
    for (const m of [designee.mot, ...autres].map(singulier)) {
      const n = candidats.filter((e) => normaliser(e.nom ?? '').includes(m)).length
      if (n > 0 && n < candidats.length) {
        const exemple = candidats.find((e) => normaliser(e.nom ?? '').includes(m))
        nomContient = motOriginal(exemple?.nom ?? m, m)
        retenus = n
        break
      }
    }
    if (niveau === null && nomContient === null && PAR_ETAGE.has(f)) continue
    propositions.push({ tacheId: t.id, famille: f, niveau, nomContient, elements: retenus })
  }
  return propositions
}
