import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icone } from '@/lib/icones'

export default function Introuvable() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <Icone.rechercher className="text-muted-foreground size-10" />
      <h1 className="mt-4 text-lg font-semibold">Page introuvable</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Cette adresse ne correspond a aucun ecran de l&apos;application.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Retour au tableau de bord</Link>
      </Button>
    </div>
  )
}
