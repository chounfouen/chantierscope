import type { Metadata } from 'next'
import { Icone } from '@/lib/icones'

export const metadata: Metadata = { title: 'Hors ligne' }

/**
 * Page de secours du service worker, servie quand une page demandee sans
 * reseau n'a jamais ete consultee sur ce telephone. Statique, sans donnee de
 * compte : elle est mise en cache a l'installation.
 */
export default function HorsLigne() {
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      <Icone.horsLigne className="text-muted-foreground mx-auto size-10" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold">Pas de réseau</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Cette page n’a pas encore été ouverte sur ce téléphone et ne peut pas s’afficher sans
        connexion. L’écran de saisie, s’il a déjà été ouvert une fois, reste utilisable : les
        relevés saisis partiront au retour du réseau.
      </p>
    </main>
  )
}
