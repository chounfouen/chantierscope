/**
 * Geometrie du diagramme de Gantt.
 *
 * Tout ce qui se calcule dans le Gantt se calcule ici, en fonctions pures :
 * echelle de temps, paliers de zoom et conservation du centrage, lignes
 * visibles de la WBS repliable, fenetre de virtualisation, trace des
 * liaisons en polylignes orthogonales et repartition des couloirs. Le
 * composant ne fait que dessiner ce que ces fonctions lui donnent.
 *
 * Unite de temps : le jour depuis l'origine du projet, entier, bornes
 * incluses, comme dans le moteur de reseau. Une tache des jours 3 a 7 occupe
 * horizontalement l'intervalle [x(3), x(8)[ : sa barre couvre cinq journees.
 */

/* -------------------------------------------------------------------------- */
/* Echelle et zoom                                                            */
/* -------------------------------------------------------------------------- */

export const PALIERS = ['jour', 'semaine', 'mois', 'trimestre'] as const
export type Palier = (typeof PALIERS)[number]

/**
 * Largeur d'une journee a chaque palier. Choisie pour qu'une graduation
 * mineure reste lisible : un jour a 32 pixels, une semaine a 84, un mois a
 * environ 120, un trimestre a environ 135.
 */
export const PIXELS_PAR_JOUR: Record<Palier, number> = {
  jour: 32,
  semaine: 12,
  mois: 4,
  trimestre: 1.5,
}

export function xDeJour(jour: number, palier: Palier): number {
  return jour * PIXELS_PAR_JOUR[palier]
}

export function jourDeX(x: number, palier: Palier): number {
  return x / PIXELS_PAR_JOUR[palier]
}

/** Journee, eventuellement fractionnaire, situee au centre de la vue. */
export function jourAuCentre(defilement: number, largeurVue: number, palier: Palier): number {
  return jourDeX(defilement + largeurVue / 2, palier)
}

/**
 * Defilement horizontal qui place une journee au centre de la vue.
 *
 * C'est ce qui conserve le centrage temporel au changement de palier : on
 * lit la journee centrale avant le changement, on la recentre apres. Sans
 * cela, passer du mois au jour renverrait l'utilisateur a l'ordre de
 * service, a des centaines de jours de ce qu'il regardait.
 */
export function defilementPourCentrer(
  jour: number,
  palier: Palier,
  largeurVue: number,
  largeurTotale: number,
): number {
  const brut = xDeJour(jour, palier) - largeurVue / 2
  return Math.max(0, Math.min(brut, Math.max(0, largeurTotale - largeurVue)))
}

/* -------------------------------------------------------------------------- */
/* Graduations                                                                */
/* -------------------------------------------------------------------------- */

export type Graduation = { jour: number; date: Date }

function dateDuJour(origine: string, jour: number): Date {
  const d = new Date(`${origine}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + jour)
  return d
}

function jourDeDate(origine: string, d: Date): number {
  return Math.round((d.getTime() - Date.parse(`${origine}T00:00:00Z`)) / 86_400_000)
}

/**
 * Debuts de periode compris dans [0, nombreJours[ : jours, lundis, premiers
 * du mois, debuts de trimestre ou debuts d'annee. Le libelle est laisse a
 * l'affichage, qui passe par `format.ts`.
 */
export function debutsDePeriode(
  origine: string,
  nombreJours: number,
  periode: 'jour' | 'semaine' | 'mois' | 'trimestre' | 'annee',
): Graduation[] {
  const resultat: Graduation[] = []
  for (let j = 0; j < nombreJours; j++) {
    const d = dateDuJour(origine, j)
    const jourMois = d.getUTCDate()
    const mois = d.getUTCMonth()
    const debut =
      periode === 'jour' ||
      (periode === 'semaine' && d.getUTCDay() === 1) ||
      (periode === 'mois' && jourMois === 1) ||
      (periode === 'trimestre' && jourMois === 1 && mois % 3 === 0) ||
      (periode === 'annee' && jourMois === 1 && mois === 0)
    if (debut) resultat.push({ jour: j, date: d })
  }
  return resultat
}

/** Periodes des deux bandeaux de l'echelle, pour chaque palier. */
export const BANDEAUX: Record<
  Palier,
  { majeure: 'semaine' | 'mois' | 'annee'; mineure: 'jour' | 'semaine' | 'mois' | 'trimestre' }
> = {
  jour: { majeure: 'semaine', mineure: 'jour' },
  semaine: { majeure: 'mois', mineure: 'semaine' },
  mois: { majeure: 'annee', mineure: 'mois' },
  trimestre: { majeure: 'annee', mineure: 'trimestre' },
}

export { dateDuJour, jourDeDate }

/* -------------------------------------------------------------------------- */
/* WBS repliable                                                              */
/* -------------------------------------------------------------------------- */

export type ElementWbs = { id: string; parentId: string | null; codeWbs: string }

export type LigneVisible = {
  id: string
  profondeur: number
  aEnfants: boolean
}

/**
 * Lignes affichees, dans l'ordre de la WBS, en sautant les descendants des
 * noeuds replies. L'ordre suit le code WBS compare numeriquement par
 * segment : 04.10 vient apres 04.9, contrairement a l'ordre alphabetique.
 */
export function lignesVisibles(
  elements: readonly ElementWbs[],
  replies: ReadonlySet<string>,
): LigneVisible[] {
  const enfants = new Map<string | null, ElementWbs[]>()
  const ids = new Set(elements.map((e) => e.id))
  for (const e of elements) {
    // Un parent absent de la liste fait de l'element une racine.
    const parent = e.parentId !== null && ids.has(e.parentId) ? e.parentId : null
    const liste = enfants.get(parent) ?? []
    liste.push(e)
    enfants.set(parent, liste)
  }
  for (const liste of enfants.values()) liste.sort((a, b) => comparerWbs(a.codeWbs, b.codeWbs))

  const resultat: LigneVisible[] = []
  const parcourir = (parent: string | null, profondeur: number) => {
    for (const e of enfants.get(parent) ?? []) {
      const aEnfants = (enfants.get(e.id)?.length ?? 0) > 0
      resultat.push({ id: e.id, profondeur, aEnfants })
      if (aEnfants && !replies.has(e.id)) parcourir(e.id, profondeur + 1)
    }
  }
  parcourir(null, 0)
  return resultat
}

export function comparerWbs(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = Number(x)
    const ny = Number(y)
    const c = Number.isNaN(nx) || Number.isNaN(ny) ? x.localeCompare(y) : nx - ny
    if (c !== 0) return c
  }
  return 0
}

/* -------------------------------------------------------------------------- */
/* Virtualisation verticale                                                   */
/* -------------------------------------------------------------------------- */

/** Au-dela de ce nombre de lignes, seules les lignes proches de la vue sont rendues. */
export const SEUIL_VIRTUALISATION = 100

/**
 * Indices [debut, fin[ des lignes a rendre. Une marge de lignes au-dessus et
 * au-dessous evite l'apparition de blancs pendant un defilement rapide.
 */
export function fenetre(
  defilement: number,
  hauteurVue: number,
  hauteurLigne: number,
  total: number,
  marge = 8,
): { debut: number; fin: number } {
  if (total <= SEUIL_VIRTUALISATION) return { debut: 0, fin: total }
  const premier = Math.floor(Math.max(0, defilement) / hauteurLigne)
  const visibles = Math.ceil(hauteurVue / hauteurLigne)
  return {
    debut: Math.max(0, premier - marge),
    fin: Math.min(total, premier + visibles + marge),
  }
}

/* -------------------------------------------------------------------------- */
/* Liaisons                                                                   */
/* -------------------------------------------------------------------------- */

export type Point = { x: number; y: number }

/** Une barre, reduite a ce que le trace des liaisons en utilise. */
export type Barre = { x0: number; x1: number; y: number }

export type TypeLiaisonGantt = 'FD' | 'DD' | 'FF' | 'DF'

/**
 * Polyligne orthogonale d'une liaison.
 *
 * La liaison quitte la barre amont par le cote designe par son type (la fin
 * pour FD et FF, le debut pour DD et DF), et entre dans la barre aval par
 * l'autre cote (le debut pour FD et DD, la fin pour FF et DF). Elle sort
 * horizontalement, et entre horizontalement apres une courte approche, pour
 * que la fleche reste lisible.
 *
 * Trois segments suffisent quand un meme couloir vertical est atteignable
 * en sortie et en entree. Sinon, le trace contourne par l'interligne situe
 * sous la barre amont, en cinq segments : c'est le cas d'un successeur qui
 * commence avant la fin de son predecesseur.
 */
export function tracerLiaison(
  amont: Barre,
  aval: Barre,
  type: TypeLiaisonGantt,
  hauteurLigne: number,
  ecart = 8,
): Point[] {
  const sortParFin = type === 'FD' || type === 'FF'
  const entreParDebut = type === 'FD' || type === 'DD'
  const xs = sortParFin ? amont.x1 : amont.x0
  const xt = entreParDebut ? aval.x0 : aval.x1
  const dirS = sortParFin ? 1 : -1
  const dirT = entreParDebut ? -1 : 1

  // Couloir vertical admissible : au-dela de la sortie, en deca de l'approche.
  const sortie = xs + dirS * ecart
  const approche = xt + dirT * ecart
  let couloir: number | null = null
  if (dirS === 1 && dirT === -1 && sortie <= approche) couloir = sortie
  if (dirS === 1 && dirT === 1) couloir = Math.max(sortie, approche)
  if (dirS === -1 && dirT === -1) couloir = Math.min(sortie, approche)
  if (dirS === -1 && dirT === 1 && approche <= sortie) couloir = sortie

  const points: Point[] =
    couloir !== null
      ? [
          { x: xs, y: amont.y },
          { x: couloir, y: amont.y },
          { x: couloir, y: aval.y },
          { x: xt, y: aval.y },
        ]
      : (() => {
          const interligne = amont.y + (aval.y >= amont.y ? 1 : -1) * (hauteurLigne / 2)
          return [
            { x: xs, y: amont.y },
            { x: sortie, y: amont.y },
            { x: sortie, y: interligne },
            { x: approche, y: interligne },
            { x: approche, y: aval.y },
            { x: xt, y: aval.y },
          ]
        })()
  return simplifier(points)
}

/** Retire les points intermediaires alignes et les doublons. */
export function simplifier(points: Point[]): Point[] {
  const sansDoublon = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1]?.x || p.y !== points[i - 1]?.y,
  )
  return sansDoublon.filter((p, i) => {
    const a = sansDoublon[i - 1]
    const b = sansDoublon[i + 1]
    if (!a || !b) return true
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y))
  })
}

/**
 * Evitement des chevauchements : deux liaisons issues de taches differentes
 * qui empruntent le meme couloir vertical sur des hauteurs qui se recouvrent
 * se confondraient a l'ecran. La seconde est decalee d'un pas, la troisieme
 * de deux, et ainsi de suite.
 *
 * Les liaisons d'une meme tache amont partagent volontairement leur couloir :
 * elles forment un arbre lisible, issu d'un meme point.
 */
export function repartirCouloirs(
  traces: readonly { source: string; points: Point[] }[],
  pas = 3,
): Point[][] {
  type Segment = { x: number; y0: number; y1: number; source: string }
  const occupes: Segment[] = []
  return traces.map(({ source, points }) => {
    // Le premier segment vertical porte le couloir de la liaison.
    const i = points.findIndex((p, k) => k > 0 && points[k - 1]?.x === p.x)
    if (i < 1) return points
    const a = points[i - 1] as Point
    const b = points[i] as Point
    const y0 = Math.min(a.y, b.y)
    const y1 = Math.max(a.y, b.y)
    let decalage = 0
    const enConflit = (x: number) =>
      occupes.some((s) => s.source !== source && Math.abs(s.x - x) < pas && s.y0 < y1 && y0 < s.y1)
    while (enConflit(a.x + decalage) && decalage < pas * 10) decalage += pas
    occupes.push({ x: a.x + decalage, y0, y1, source })
    if (decalage === 0) return points
    return points.map((p, k) => (k === i - 1 || k === i ? { x: p.x + decalage, y: p.y } : p))
  })
}

/** Attribut `points` d'une polyligne SVG. */
export function enAttributPoints(points: readonly Point[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')
}

function round(v: number): number {
  return Math.round(v * 10) / 10
}

/* -------------------------------------------------------------------------- */
/* Journees non travaillables                                                 */
/* -------------------------------------------------------------------------- */

export type JourneeGrisee = { jour: number; cause: string }

/**
 * Journees a griser sur l'echelle de temps, avec leur cause : repos
 * hebdomadaire, jour ferie, ou arret constate sur le chantier. Plusieurs
 * causes le meme jour sont reunies.
 */
export function journeesGrisees(
  origine: string,
  nombreJours: number,
  estOuvrable: (date: string) => boolean,
  causeCalendaire: (date: string) => string | null,
  arrets: readonly { date: string; cause: string }[],
): JourneeGrisee[] {
  const parJour = new Map<number, string[]>()
  for (let j = 0; j < nombreJours; j++) {
    const date = dateDuJour(origine, j).toISOString().slice(0, 10)
    if (!estOuvrable(date)) parJour.set(j, [causeCalendaire(date) ?? 'Jour non ouvrable'])
  }
  for (const a of arrets) {
    const j = jourDeDate(origine, new Date(`${a.date}T00:00:00Z`))
    if (j < 0 || j >= nombreJours) continue
    const causes = parJour.get(j) ?? []
    if (!causes.includes(a.cause)) causes.push(a.cause)
    parJour.set(j, causes)
  }
  return [...parJour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([jour, causes]) => ({ jour, cause: causes.join(' ; ') }))
}
