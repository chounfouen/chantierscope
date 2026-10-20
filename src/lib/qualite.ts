/** Libelles de la qualite. Module pur. */

import type { EtatBeton } from '@/db/compute/beton'
import type { StatutNonConformite } from '@/db/schema'

export const LIBELLE_ETAT_BETON: Record<EtatBeton, string> = {
  SANS_ESSAI: 'Sans essai',
  EN_ATTENTE: 'Essais à venir',
  RESULTAT_EN_RETARD: 'Résultats en retard',
  CONFORME: 'Conforme',
  NON_CONFORME: 'Non conforme',
  A_EXPLIQUER: 'À expliquer',
}

export const LIBELLE_STATUT_NC: Record<StatutNonConformite, string> = {
  OUVERTE: 'Ouverte',
  TRAITEE: 'Traitée, à lever',
  LEVEE: 'Levée',
}
