/**
 * Formatage unique de tous les montants, pourcentages et dates.
 *
 * Aucun composant ne formate un montant lui-meme. Le franc CFA n'a pas de
 * subdivision en usage : tous les montants circulent en entiers de FCFA et
 * s'affichent sans decimale.
 */

import { differenceInCalendarDays, format, formatISO, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { Nature } from '@/db/schema'

/* -------------------------------------------------------------------------- */
/* Montants                                                                   */
/* -------------------------------------------------------------------------- */

const MONTANT = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'XOF',
  maximumFractionDigits: 0,
})

const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** `2100000000` devient `2 100 000 000 F CFA`. */
export function fcfa(montant: number): string {
  return MONTANT.format(montant)
}

/** Sans le suffixe de devise, pour les colonnes de tableau dont l'en-tete la porte deja. */
export function fcfaNu(montant: number): string {
  return NOMBRE.format(montant)
}

/**
 * Forme abregee pour les tuiles d'indicateur et les graduations d'axe, ou la
 * place manque : `2,10 Md`, `847 M`, `1,2 k`.
 *
 * Reservee a l'affichage compact. Un tableau, un total ou un export porte
 * toujours le montant complet : un chiffre arrondi ne doit jamais etre la
 * seule trace d'une valeur.
 */
export function fcfaCompact(montant: number): string {
  const signe = montant < 0 ? '-' : ''
  const v = Math.abs(montant)
  if (v >= 1e9) return `${signe}${arrondi(v / 1e9, 2)} Md`
  if (v >= 1e6) return `${signe}${arrondi(v / 1e6, 1)} M`
  if (v >= 1e3) return `${signe}${arrondi(v / 1e3, 1)} k`
  return `${signe}${NOMBRE.format(v)}`
}

function arrondi(valeur: number, decimales: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valeur)
}

/* -------------------------------------------------------------------------- */
/* Quantites                                                                  */
/* -------------------------------------------------------------------------- */

/** Unites de mesure du quantitatif, telles qu'elles s'affichent. */
export const LIBELLE_UNITE = {
  M3: 'm3',
  M2: 'm2',
  ML: 'ml',
  KG: 'kg',
  T: 't',
  U: 'u',
  ENS: 'ens',
  FORFAIT: 'forfait',
} as const

export type CodeUnite = keyof typeof LIBELLE_UNITE

/**
 * Les quantites arrivent en `numeric(14,3)`, donc en chaine depuis le pilote.
 * Le nombre de decimales affichees depend de l'unite : le beton se compte au
 * litre pres, un logement ne se compte pas en tiers.
 */
export function quantite(valeur: number | string, unite: CodeUnite): string {
  const n = typeof valeur === 'string' ? Number(valeur) : valeur
  const decimales =
    unite === 'U' || unite === 'ENS' || unite === 'FORFAIT' ? 0 : unite === 'T' ? 3 : 2
  return `${new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n)} ${LIBELLE_UNITE[unite]}`
}

/* -------------------------------------------------------------------------- */
/* Pourcentages et indices                                                    */
/* -------------------------------------------------------------------------- */

/** Une fraction `0.847` devient `84,7 %`. */
export function pourcent(fraction: number, decimales = 1): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'percent',
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(fraction)
}

/**
 * Les indices de performance SPI et CPI s'affichent a trois decimales : a deux
 * decimales, un indice de 0,995 devient 1,00 et une derive reelle disparait.
 */
export function indice(valeur: number): string {
  if (!Number.isFinite(valeur)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(valeur)
}

/** Un ecart signe, ou le signe porte du sens : `+12 j`, `-3 j`, `0 j`. */
export function jours(nombre: number): string {
  const signe = nombre > 0 ? '+' : ''
  return `${signe}${NOMBRE.format(nombre)} j`
}

/** Un ecart de montant signe, ou le signe porte du sens. */
export function fcfaSigne(montant: number): string {
  const signe = montant > 0 ? '+' : ''
  return `${signe}${fcfa(montant)}`
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Les dates de planning sont des dates sans heure ni fuseau, stockees en
 * `date` et transportees en chaine `AAAA-MM-JJ`. Elles ne passent jamais par
 * un objet `Date` construit depuis une chaine ISO complete, ce qui
 * introduirait un decalage de fuseau.
 */
export type DateSimple = string

/** `2025-01-06` devient `06/01/2025`. */
export function dateCourte(d: DateSimple): string {
  return format(parseISO(d), 'dd/MM/yyyy', { locale: fr })
}

/** `2025-01-06` devient `6 janvier 2025`. */
export function dateLongue(d: DateSimple): string {
  return format(parseISO(d), 'd MMMM yyyy', { locale: fr })
}

/** `2025-01-06` devient `janv. 25`, pour les graduations d'axe. */
export function moisCourt(d: DateSimple): string {
  return format(parseISO(d), 'MMM yy', { locale: fr })
}

/** Un instant reel, horodate : validation, prise de vue, audit. */
export function instant(d: Date): string {
  return format(d, "dd/MM/yyyy 'a' HH'h'mm", { locale: fr })
}

/** La date du jour au format des dates de planning. */
export function aujourdhui(): DateSimple {
  return formatISO(new Date(), { representation: 'date' })
}

/** Nombre de jours calendaires entre deux dates de planning, signe. */
export function ecartJours(de: DateSimple, a: DateSimple): number {
  return differenceInCalendarDays(parseISO(a), parseISO(de))
}

/* -------------------------------------------------------------------------- */
/* Meteo                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Libelle d'un code meteo WMO, tel que renvoye par Open-Meteo. Regroupe par
 * famille : sur un chantier, distinguer la bruine moderee de la bruine dense
 * n'apporte rien, distinguer la pluie de l'orage, si.
 */
export function libelleMeteo(code: number | null): string {
  if (code === null) return 'Météo non relevée'
  if (code === 0) return 'Ciel dégagé'
  if (code <= 3) return 'Nuageux'
  if (code === 45 || code === 48) return 'Brouillard'
  if (code >= 51 && code <= 57) return 'Bruine'
  if (code >= 61 && code <= 67) return 'Pluie'
  if (code >= 71 && code <= 77) return 'Neige'
  if (code >= 80 && code <= 82) return 'Averses'
  if (code >= 95) return 'Orage'
  return `Code météo ${code}`
}

/* -------------------------------------------------------------------------- */
/* Graduations du Gantt                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Libelle d'une graduation de l'echelle de temps.
 *
 * Les dates de l'echelle sont des minuits UTC. Elles sont reconstruites en
 * date locale avant formatage : formater directement un minuit UTC dans un
 * navigateur a l'ouest de Greenwich afficherait la veille.
 */
export function libelleGraduation(
  d: Date,
  periode: 'jour' | 'semaine' | 'mois' | 'trimestre' | 'annee',
  role: 'majeure' | 'mineure',
): string {
  const locale = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  switch (periode) {
    case 'jour':
      return format(locale, 'd', { locale: fr })
    case 'semaine':
      return role === 'majeure'
        ? `Semaine du ${format(locale, 'd MMMM yyyy', { locale: fr })}`
        : format(locale, 'd MMM', { locale: fr })
    case 'mois':
      return role === 'majeure'
        ? format(locale, 'MMMM yyyy', { locale: fr })
        : format(locale, 'MMM', { locale: fr })
    case 'trimestre':
      return `T${Math.floor(locale.getMonth() / 3) + 1}`
    case 'annee':
      return format(locale, 'yyyy', { locale: fr })
  }
}

/* -------------------------------------------------------------------------- */
/* Natures de tache et unites                                                 */
/* -------------------------------------------------------------------------- */

export const LIBELLE_NATURE: Record<Nature, string> = {
  TERRASSEMENT: 'Terrassement',
  VRD: 'Voirie et réseaux',
  ENROBES: 'Enrobés',
  FONDATION: 'Fondations',
  BETONNAGE: 'Béton armé',
  LEVAGE: 'Levage',
  MACONNERIE: 'Maçonnerie',
  CHARPENTE: 'Charpente',
  ETANCHEITE: 'Étanchéité',
  ENDUIT: 'Enduits',
  INTERIEUR: 'Second œuvre intérieur',
  SUPPORT: 'Installations et support',
}

/** Un nombre sans unite monetaire, a decimales fixes : `1 234,5`. */
export function nombre(valeur: number, decimales = 0): string {
  return arrondi(valeur, decimales)
}
