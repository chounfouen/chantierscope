'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Navigation, type Entree, type Groupe } from '@/components/coquille/navigation'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Icone } from '@/lib/icones'
import { cn } from '@/lib/utils'

/**
 * Barre d'onglets du telephone.
 *
 * Sous 768 pixels, la barre laterale est masquee : sans cette barre, le chef
 * de chantier arrivait sur le tableau de bord sans aucun moyen d'atteindre la
 * saisie. Trois raccourcis choisis selon le role, plus un quatrieme onglet qui
 * ouvre le menu complet dans un tiroir.
 *
 * Elle s'efface sur le formulaire de releve, qui porte sa propre barre
 * d'actions en bas d'ecran : deux barres superposees masqueraient « Suivant ».
 */
export function NavigationMobile({
  raccourcis,
  groupes,
}: {
  raccourcis: readonly Entree[]
  groupes: readonly Groupe[]
}) {
  const chemin = usePathname()
  // Le tiroir est ouvert POUR une page : quand l'utilisateur choisit un
  // ecran, le chemin change et le tiroir se referme de lui-meme.
  const [ouvertSur, setOuvertSur] = useState<string | null>(null)

  if (/\/releve\/(nouveau|[^/]+\/(modifier|rectifier))$/.test(chemin)) return null

  // L'onglet actif est le plus specifique, comme dans la barre laterale.
  const actif = raccourcis
    .filter((e) => chemin === e.href || chemin.startsWith(`${e.href}/`))
    .reduce<string | null>((m, e) => (m === null || e.href.length > m.length ? e.href : m), null)

  const onglet =
    'flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[0.75rem] font-bold'

  return (
    <nav
      aria-label="Navigation du téléphone"
      className="bg-card/95 border-border/70 fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {raccourcis.map((e) => {
        const IconeEntree = Icone[e.icone]
        const estActif = e.href === actif
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={estActif ? 'page' : undefined}
            className={cn(onglet, estActif ? 'text-marque' : 'text-foreground/70')}
          >
            <IconeEntree className="size-6" strokeWidth={estActif ? 2.25 : 1.9} aria-hidden />
            {e.libelle}
          </Link>
        )
      })}

      <Sheet open={ouvertSur === chemin} onOpenChange={(o) => setOuvertSur(o ? chemin : null)}>
        <SheetTrigger className={cn(onglet, 'text-foreground/70')}>
          <Icone.menu className="size-6" strokeWidth={1.9} aria-hidden />
          Plus
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto px-3 pt-5 pb-8">
          <SheetTitle className="px-3 text-base font-extrabold">Tous les écrans</SheetTitle>
          <Navigation groupes={groupes} />
        </SheetContent>
      </Sheet>
    </nav>
  )
}
