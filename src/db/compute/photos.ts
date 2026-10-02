/**
 * Organisation de la timeline photographique.
 *
 * Une photo ne vaut, pour le suivi d'un chantier, que comparee a une autre
 * prise du meme endroit : d'ou le regroupement par point de vue, et le
 * curseur temporel qui montre, pour chaque point de vue, la derniere prise a
 * une date donnee. Fonctions pures, sans base ni horloge.
 *
 * Les dates sont des dates de chantier sans heure, `AAAA-MM-JJ`. Le chantier
 * est a Abidjan, en temps universel toute l'annee : la date d'une prise de
 * vue est la date UTC de son instant.
 */

export type PhotoTimeline = {
  id: string
  /** Date de prise de vue, sans heure. */
  date: string
  pointDeVueId: string | null
  lotId: string | null
  legende: string | null
}

export type FiltrePhotos = {
  pointDeVueId?: string | null
  lotId?: string | null
  /** Bornes incluses. */
  du?: string | null
  au?: string | null
}

export function filtrer<P extends PhotoTimeline>(photos: readonly P[], f: FiltrePhotos): P[] {
  return photos.filter(
    (p) =>
      (!f.pointDeVueId || p.pointDeVueId === f.pointDeVueId) &&
      (!f.lotId || p.lotId === f.lotId) &&
      (!f.du || p.date >= f.du) &&
      (!f.au || p.date <= f.au),
  )
}

const chronologique = <P extends PhotoTimeline>(a: P, b: P) =>
  a.date.localeCompare(b.date) || a.id.localeCompare(b.id)

export type GroupePointDeVue<P> = { pointDeVueId: string | null; photos: P[] }

/**
 * Photos regroupees par point de vue, chaque groupe en ordre chronologique.
 * Les photos sans point de vue forment un dernier groupe : elles restent
 * consultables, mais ne se comparent a rien.
 */
export function parPointDeVue<P extends PhotoTimeline>(
  photos: readonly P[],
  ordre: readonly string[],
): GroupePointDeVue<P>[] {
  const groupes = new Map<string | null, P[]>()
  for (const p of [...photos].sort(chronologique)) {
    const g = groupes.get(p.pointDeVueId) ?? []
    g.push(p)
    groupes.set(p.pointDeVueId, g)
  }
  const rang = (id: string | null) =>
    id === null ? Infinity : ordre.indexOf(id) + 1 || ordre.length
  return [...groupes.entries()]
    .sort((a, b) => rang(a[0]) - rang(b[0]))
    .map(([pointDeVueId, ps]) => ({ pointDeVueId, photos: ps }))
}

/** Photos regroupees par date, la plus recente en tete : la grille. */
export function parDate<P extends PhotoTimeline>(
  photos: readonly P[],
): { date: string; photos: P[] }[] {
  const groupes = new Map<string, P[]>()
  for (const p of [...photos].sort(chronologique)) {
    const g = groupes.get(p.date) ?? []
    g.push(p)
    groupes.set(p.date, g)
  }
  return [...groupes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, ps]) => ({ date, photos: ps }))
}

/** Dates distinctes des prises de vue, en ordre chronologique : les crans du curseur. */
export function datesDePrise(photos: readonly PhotoTimeline[]): string[] {
  return [...new Set(photos.map((p) => p.date))].sort()
}

/**
 * Photo d'un groupe a une date : la derniere prise a cette date ou avant.
 * Avant la premiere prise, il n'y a rien a montrer : nul.
 */
export function photoA<P extends PhotoTimeline>(photos: readonly P[], date: string): P | null {
  let retenue: P | null = null
  for (const p of photos) {
    if (p.date > date) break
    retenue = p
  }
  return retenue
}

/** Ecart en jours entre deux prises, pour legender une comparaison. */
export function joursEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}
