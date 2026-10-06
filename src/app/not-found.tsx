import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Icone } from '@/lib/icones'

export default function Introuvable() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4 text-center">
      <span className="pastille mx-auto size-16 rounded-3xl">
        <Icone.rechercher className="size-8" strokeWidth={2} aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Page introuvable</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Cette adresse ne correspond à aucun écran de l&apos;application.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/">Retour au tableau de bord</Link>
      </Button>
    </div>
  )
}
