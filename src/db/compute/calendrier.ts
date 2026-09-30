/**
 * Calendrier ouvrable ivoirien.
 *
 * Toutes les durees du planning sont exprimees en jours CALENDAIRES : c'est la
 * convention du contrat et celle du calcul de penalite. Ce module sert a
 * l'affichage, au grisage des journees non ouvrables dans le diagramme de
 * Gantt, et a la conversion vers des jours ouvrables quand un rendement doit
 * etre rapporte a du temps de travail effectif.
 *
 * Reserve importante sur les fetes musulmanes : leurs dates dependent de
 * l'observation lunaire et sont annoncees par les autorites religieuses
 * quelques jours avant. Les dates portees ici sont des ESTIMATIONS. Une mise
 * en service reelle devrait les saisir a la main a mesure de leur annonce, ou
 * les lire depuis une source officielle. Elles sont marquees comme telles.
 */

import { addDays, formatISO, parseISO } from 'date-fns'

export type Ferie = {
  date: string
  nom: string
  /** Vrai si la date est estimee et non officiellement arretee. */
  estimee: boolean
}

/* -------------------------------------------------------------------------- */
/* Fetes a date fixe                                                          */
/* -------------------------------------------------------------------------- */

const FIXES: readonly { mois: number; jour: number; nom: string }[] = [
  { mois: 1, jour: 1, nom: 'Jour de l an' },
  { mois: 5, jour: 1, nom: 'Fete du travail' },
  { mois: 8, jour: 7, nom: 'Fete nationale' },
  { mois: 8, jour: 15, nom: 'Assomption' },
  { mois: 11, jour: 1, nom: 'Toussaint' },
  { mois: 11, jour: 15, nom: 'Journee nationale de la paix' },
  { mois: 12, jour: 25, nom: 'Noel' },
]

/* -------------------------------------------------------------------------- */
/* Fetes mobiles chretiennes, calculees                                       */
/* -------------------------------------------------------------------------- */

/**
 * Dimanche de Paques, algorithme gregorien anonyme.
 *
 * Les trois fetes mobiles chretiennes du calendrier ivoirien en decoulent :
 * lundi de Paques a plus un jour, Ascension a plus trente-neuf, lundi de
 * Pentecote a plus cinquante.
 */
export function paques(annee: number): string {
  const a = annee % 19
  const b = Math.floor(annee / 100)
  const c = annee % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mois = Math.floor((h + l - 7 * m + 114) / 31)
  const jour = ((h + l - 7 * m + 114) % 31) + 1
  return `${annee}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
}

/* -------------------------------------------------------------------------- */
/* Fetes musulmanes, estimees                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Estimations pour les annees couvertes par le projet.
 *
 * Ces dates ne sont PAS officielles : elles dependent de l'observation du
 * croissant lunaire et peuvent glisser d'un jour. Une exploitation reelle
 * devrait permettre au conducteur de les corriger.
 */
const MUSULMANES: Record<number, readonly { date: string; nom: string }[]> = {
  2025: [
    { date: '2025-03-27', nom: 'Laylat al-Qadr' },
    { date: '2025-03-31', nom: 'Aid el-Fitr' },
    { date: '2025-06-07', nom: 'Aid el-Kebir' },
    { date: '2025-09-05', nom: 'Maouloud' },
  ],
  2026: [
    { date: '2026-03-16', nom: 'Laylat al-Qadr' },
    { date: '2026-03-20', nom: 'Aid el-Fitr' },
    { date: '2026-05-27', nom: 'Aid el-Kebir' },
    { date: '2026-08-25', nom: 'Maouloud' },
  ],
  2027: [
    { date: '2027-03-06', nom: 'Laylat al-Qadr' },
    { date: '2027-03-10', nom: 'Aid el-Fitr' },
    { date: '2027-05-17', nom: 'Aid el-Kebir' },
    { date: '2027-08-15', nom: 'Maouloud' },
  ],
  2028: [
    { date: '2028-02-23', nom: 'Laylat al-Qadr' },
    { date: '2028-02-27', nom: 'Aid el-Fitr' },
    { date: '2028-05-05', nom: 'Aid el-Kebir' },
    { date: '2028-08-03', nom: 'Maouloud' },
  ],
}

/* -------------------------------------------------------------------------- */
/* Interface                                                                  */
/* -------------------------------------------------------------------------- */

const cache = new Map<number, Map<string, Ferie>>()

/** Tous les jours feries d'une annee, indexes par date. */
export function feriesDeLAnnee(annee: number): Map<string, Ferie> {
  const enCache = cache.get(annee)
  if (enCache) return enCache

  const feries = new Map<string, Ferie>()

  for (const f of FIXES) {
    const date = `${annee}-${String(f.mois).padStart(2, '0')}-${String(f.jour).padStart(2, '0')}`
    feries.set(date, { date, nom: f.nom, estimee: false })
  }

  const dimanchePaques = parseISO(paques(annee))
  const mobiles: [number, string][] = [
    [1, 'Lundi de Paques'],
    [39, 'Ascension'],
    [50, 'Lundi de Pentecote'],
  ]
  for (const [decalage, nom] of mobiles) {
    const date = formatISO(addDays(dimanchePaques, decalage), { representation: 'date' })
    feries.set(date, { date, nom, estimee: false })
  }

  for (const f of MUSULMANES[annee] ?? []) {
    feries.set(f.date, { date: f.date, nom: f.nom, estimee: true })
  }

  cache.set(annee, feries)
  return feries
}

/** Jour ferie correspondant a une date, ou nul. */
export function ferie(date: string): Ferie | null {
  const annee = Number(date.slice(0, 4))
  return feriesDeLAnnee(annee).get(date) ?? null
}

export type OptionsCalendrier = {
  /**
   * Jours de repos hebdomadaire, de 0 pour dimanche a 6 pour samedi.
   *
   * Par defaut le seul dimanche : sur un chantier ivoirien, le samedi est
   * couramment travaille.
   */
  joursRepos?: readonly number[]
  /** Tenir compte des jours feries. Vrai par defaut. */
  feries?: boolean
}

/** Une date est-elle ouvrable ? */
export function estOuvrable(date: string, options: OptionsCalendrier = {}): boolean {
  const repos = options.joursRepos ?? [0]
  const tenirCompteFeries = options.feries ?? true
  // Construit en UTC pour que le jour de la semaine ne depende pas du fuseau.
  const jourSemaine = new Date(`${date}T12:00:00Z`).getUTCDay()
  if (repos.includes(jourSemaine)) return false
  if (tenirCompteFeries && ferie(date) !== null) return false
  return true
}

/** Nombre de jours ouvrables entre deux dates, bornes incluses. */
export function joursOuvrables(
  debut: string,
  fin: string,
  options: OptionsCalendrier = {},
): number {
  let n = 0
  let courant = parseISO(debut)
  const derniere = parseISO(fin)
  while (courant <= derniere) {
    if (estOuvrable(formatISO(courant, { representation: 'date' }), options)) n++
    courant = addDays(courant, 1)
  }
  return n
}

/** Jours feries tombant dans une periode, bornes incluses. */
export function feriesEntre(debut: string, fin: string): Ferie[] {
  const resultat: Ferie[] = []
  for (let annee = Number(debut.slice(0, 4)); annee <= Number(fin.slice(0, 4)); annee++) {
    for (const f of feriesDeLAnnee(annee).values()) {
      if (f.date >= debut && f.date <= fin) resultat.push(f)
    }
  }
  return resultat.sort((a, b) => a.date.localeCompare(b.date))
}
