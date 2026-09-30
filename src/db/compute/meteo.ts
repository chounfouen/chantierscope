/**
 * Regles de journee non travaillable.
 *
 * Les seuils sont ceux couramment retenus sur un chantier de batiment en
 * climat tropical. Ils determinent, pour une journee donnee, quelles natures
 * d'ouvrage ne peuvent pas etre executees.
 *
 * Fonction pure : ne lit ni la base, ni l'horloge. Utilisee par le peuplement
 * pour faire emerger les arrets d'intemperie, et par l'application pour
 * proposer au conducteur un alea a confirmer. Les tests du sprint 2 couvrent
 * chaque seuil a sa valeur limite et de part et d'autre.
 */

import type { Nature } from '@/db/schema'

export type ReleveMeteo = {
  /** Code meteo WMO. */
  code: number
  temperatureMaxC: number
  temperatureMinC: number
  precipitationsMm: number
  rafalesKmh: number
}

export type Seuil = {
  /** Identifiant court, pour le libelle de l'alea. */
  cause: string
  libelle: string
  atteint: (m: ReleveMeteo) => boolean
  natures: readonly Nature[]
}

const EXTERIEUR: readonly Nature[] = [
  'TERRASSEMENT',
  'VRD',
  'ENROBES',
  'FONDATION',
  'BETONNAGE',
  'LEVAGE',
  'MACONNERIE',
  'CHARPENTE',
  'ETANCHEITE',
  'ENDUIT',
]

/**
 * Ordre significatif : le premier seuil atteint donne la cause affichee, donc
 * du plus bloquant au moins bloquant.
 */
export const SEUILS: readonly Seuil[] = [
  {
    cause: 'PLUIE_FORTE',
    libelle: 'Pluie forte, plus de 25 mm sur la journee',
    atteint: (m) => m.precipitationsMm > 25,
    natures: EXTERIEUR,
  },
  {
    cause: 'VENT_GRUE',
    libelle: 'Rafales superieures a 72 km/h, arret de grue obligatoire',
    atteint: (m) => m.rafalesKmh > 72,
    natures: ['LEVAGE', 'CHARPENTE'],
  },
  {
    cause: 'PLUIE',
    libelle: 'Pluie, plus de 10 mm sur la journee',
    // Le betonnage structurel ne figure PAS ici : on coule sous pluie legere
    // avec bachage et cure adaptee. Seule la pluie forte, au seuil de 25 mm,
    // l'interdit. Les terrassements, les VRD, l'etancheite et les enduits
    // sont en revanche reellement arretes des 10 mm.
    atteint: (m) => m.precipitationsMm > 10,
    natures: ['TERRASSEMENT', 'VRD', 'ENROBES', 'ETANCHEITE', 'ENDUIT'],
  },
  {
    cause: 'VENT_LEVAGE',
    libelle: 'Rafales superieures a 50 km/h, levage suspendu',
    atteint: (m) => m.rafalesKmh > 50,
    natures: ['LEVAGE'],
  },
  {
    cause: 'CHALEUR',
    libelle: 'Temperature superieure a 40 degres, betonnage sans cure renforcee',
    atteint: (m) => m.temperatureMaxC > 40,
    natures: ['BETONNAGE'],
  },
  {
    cause: 'FROID',
    libelle: 'Temperature inferieure a 5 degres, betonnage et enduits interdits',
    atteint: (m) => m.temperatureMinC < 5,
    natures: ['BETONNAGE', 'ENDUIT'],
  },
]

/** Natures d'ouvrage bloquees par la meteo du jour. */
export function naturesBloquees(m: ReleveMeteo): Set<Nature> {
  const bloquees = new Set<Nature>()
  for (const seuil of SEUILS) {
    if (seuil.atteint(m)) for (const n of seuil.natures) bloquees.add(n)
  }
  return bloquees
}

/** Cause dominante d'un arret, ou nulle si la journee est travaillable. */
export function causeArret(m: ReleveMeteo): Seuil | null {
  return SEUILS.find((s) => s.atteint(m)) ?? null
}
