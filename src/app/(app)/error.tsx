'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Icone } from '@/lib/icones'

/**
 * Frontiere d'erreur de l'application.
 *
 * Distingue le refus d'acces des autres pannes : un utilisateur qui n'a pas
 * le droit doit comprendre que ce n'est pas un dysfonctionnement, et ne pas
 * etre invite a reessayer indefiniment.
 */
export default function Erreur({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const refus = error.message.startsWith('Accès refusé')

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      {refus ? (
        <span className="pastille mx-auto size-16 rounded-3xl">
          <Icone.nonConformite className="size-8" strokeWidth={2} aria-hidden />
        </span>
      ) : (
        <span className="pastille mx-auto size-16 rounded-3xl">
          <Icone.alerte className="size-8" strokeWidth={2} aria-hidden />
        </span>
      )}

      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
        {refus ? 'Accès refusé' : 'Une erreur est survenue'}
      </h1>

      <p className="text-muted-foreground mt-2 text-sm">
        {refus
          ? 'Votre rôle ne vous donne pas accès à cet écran, ou ce chantier ne vous est pas rattaché.'
          : 'L’affichage de cet écran a échoué. Si le problème persiste, prévenez l’administrateur.'}
      </p>

      {error.digest !== undefined && (
        <p className="text-muted-foreground mt-2 font-mono text-xs">référence {error.digest}</p>
      )}

      {!refus && (
        <Button onClick={reset} variant="outline" className="mt-6">
          Réessayer
        </Button>
      )}
    </div>
  )
}
