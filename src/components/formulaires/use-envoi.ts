'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import type { ResultatAction } from '@/lib/action'

/**
 * Envoi d'un formulaire a une Server Action : notification du resultat,
 * rafraichissement de la page en cas de succes. Le formulaire ne porte
 * aucune regle : il recueille, envoie, affiche la reponse.
 */
export function useEnvoi() {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  function envoyer(action: () => Promise<ResultatAction>, apres?: () => void) {
    demarrer(async () => {
      const r = await action()
      if (r.ok) {
        toast.success(r.message)
        apres?.()
        router.refresh()
      } else toast.error(r.message)
    })
  }
  return { enCours, envoyer }
}
