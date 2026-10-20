/** Libelles du registre de securite et de la sous-traitance. Module pur. */

import type { StatutAgrement, TypeEvenementSecurite } from '@/db/schema'

export const LIBELLE_EVENEMENT: Record<TypeEvenementSecurite, string> = {
  ACCIDENT_AVEC_ARRET: 'Accident avec arrêt',
  ACCIDENT_SANS_ARRET: 'Accident sans arrêt',
  PRESQU_ACCIDENT: 'Presqu’accident',
  SITUATION_DANGEREUSE: 'Situation dangereuse',
  CAUSERIE: 'Causerie sécurité',
  VISITE: 'Visite du coordonnateur',
}

export const TYPES_EVENEMENT = Object.keys(LIBELLE_EVENEMENT) as TypeEvenementSecurite[]

export const LIBELLE_AGREMENT: Record<StatutAgrement, string> = {
  DEMANDE: 'Agrément demandé',
  AGREE: 'Agréé',
  REFUSE: 'Refusé',
}
