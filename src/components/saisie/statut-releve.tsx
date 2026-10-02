import { Badge } from '@/components/ui/badge'
import type { StatutReleve } from '@/db/schema'
import { STATUT_RELEVE } from '@/lib/etats'

/** Statut d'un releve : couleur, icone et libelle, jamais la couleur seule. */
export function PastilleStatut({ statut }: { statut: StatutReleve }) {
  const s = STATUT_RELEVE[statut]
  const IconeStatut = s.icone
  return (
    <Badge variant="outline" className="gap-1.5 font-normal" title={s.definition}>
      <IconeStatut className="size-3.5" style={{ color: s.couleur }} aria-hidden />
      {s.libelle}
    </Badge>
  )
}
