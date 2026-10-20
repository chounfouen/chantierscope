/** Libelles de la reception. Module pur. */

import type { PhaseReserve } from '@/db/schema'

export const LIBELLE_PHASE: Record<PhaseReserve, string> = {
  OPR: 'Opérations préalables',
  RECEPTION: 'Réception',
  PARFAIT_ACHEVEMENT: 'Parfait achèvement',
}

export const PHASES = Object.keys(LIBELLE_PHASE) as PhaseReserve[]
