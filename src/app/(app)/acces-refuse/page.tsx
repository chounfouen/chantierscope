import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icone } from '@/lib/icones'

export const metadata: Metadata = { title: 'Accès refusé' }

/**
 * Ecran du refus d'acces. Distinct de la page d'erreur : ne pas avoir le
 * droit n'est pas une panne, et il n'y a rien a reessayer.
 */
export default function AccesRefuse() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <Icone.nonConformite className="text-etat-critique mx-auto size-10" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold">Accès refusé</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Votre rôle ne donne pas accès à cet écran, ou ce chantier ne vous est pas rattaché.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Retour au tableau de bord</Link>
      </Button>
    </div>
  )
}
