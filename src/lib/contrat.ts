import type { TypeOrdreService } from '@/db/schema'

/** Libelles des ordres de service, partages par le serveur et le navigateur. */
export const LIBELLE_ORDRE: Record<TypeOrdreService, string> = {
  DEMARRAGE: 'Démarrage',
  ARRET: 'Arrêt',
  REPRISE: 'Reprise',
  PROLONGATION: 'Prolongation',
  AUTRE: 'Autre',
}
