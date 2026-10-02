'use client'

/**
 * Boutons du circuit de validation, sur la fiche d'un releve.
 *
 * Seules les actions permises au role et au statut sont proposees ; le
 * serveur les reverifie de toute facon. Un bouton masque est un confort,
 * pas une securite.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { soumettreAction, validerAction } from '@/app/(app)/projet/[id]/releve/actions'
import { Button } from '@/components/ui/button'
import type { ActionReleve } from '@/lib/droits'
import { Icone } from '@/lib/icones'

export function ActionsReleve({
  projetId,
  releveId,
  actions,
}: {
  projetId: string
  releveId: string
  actions: ActionReleve[]
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()

  function executer(action: (id: string) => Promise<{ ok: boolean; message: string }>) {
    demarrer(async () => {
      const r = await action(releveId)
      if (r.ok) toast.success(r.message)
      else toast.error(r.message)
      router.refresh()
    })
  }

  if (actions.length === 0) return null
  const base = `/projet/${projetId}/releve/${releveId}`

  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes('modifier') && (
        <Button asChild variant="outline" className="h-11">
          <Link href={`${base}/modifier`}>
            <Icone.modifier className="size-4" />
            Modifier
          </Link>
        </Button>
      )}
      {actions.includes('soumettre') && (
        <Button className="h-11" disabled={enCours} onClick={() => executer(soumettreAction)}>
          <Icone.envoyer className="size-4" />
          Soumettre
        </Button>
      )}
      {actions.includes('valider') && (
        <Button className="h-11" disabled={enCours} onClick={() => executer(validerAction)}>
          <Icone.valide className="size-4" />
          Valider
        </Button>
      )}
      {actions.includes('rectifier') && (
        <Button asChild variant="outline" className="h-11">
          <Link href={`${base}/rectifier`}>
            <Icone.rectifie className="size-4" />
            Rectifier
          </Link>
        </Button>
      )}
    </div>
  )
}
