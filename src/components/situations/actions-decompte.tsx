'use client'

/** Boutons du circuit des decomptes. */

import {
  presenterDecompteAction,
  statuerDecompteAction,
} from '@/app/(app)/projet/[id]/situations/actions'
import { useEnvoi } from '@/components/formulaires/use-envoi'
import { Button } from '@/components/ui/button'

export function PresenterDecompte({ projetId, mois }: { projetId: string; mois: string }) {
  const { enCours, envoyer } = useEnvoi()
  return (
    <Button
      size="sm"
      disabled={enCours}
      onClick={() => envoyer(() => presenterDecompteAction({ projetId, mois }))}
    >
      Présenter
    </Button>
  )
}

export function DecisionDecompte({ projetId, mois }: { projetId: string; mois: string }) {
  const { enCours, envoyer } = useEnvoi()
  return (
    <span className="flex gap-1.5">
      <Button
        size="sm"
        disabled={enCours}
        onClick={() =>
          envoyer(() => statuerDecompteAction({ projetId, mois, decision: 'ACCEPTEE' }))
        }
      >
        Accepter
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={enCours}
        onClick={() =>
          envoyer(() => statuerDecompteAction({ projetId, mois, decision: 'REJETEE' }))
        }
      >
        Rejeter
      </Button>
    </span>
  )
}
