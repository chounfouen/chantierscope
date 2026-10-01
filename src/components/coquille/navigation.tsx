'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icone, type NomIcone } from '@/lib/icones'
import { cn } from '@/lib/utils'

export type Entree = {
  libelle: string
  href: string
  icone: NomIcone
  /** Ecran pas encore livre : visible mais inactif, pour situer la suite. */
  aVenir?: boolean
}

export type Groupe = { titre: string; entrees: readonly Entree[] }

export function Navigation({ groupes }: { groupes: readonly Groupe[] }) {
  const chemin = usePathname()

  return (
    <nav aria-label="Navigation principale" className="space-y-6">
      {groupes.map((groupe) => (
        <div key={groupe.titre}>
          <p className="text-muted-foreground/70 mb-1.5 px-3 text-[0.6875rem] font-medium tracking-wider uppercase">
            {groupe.titre}
          </p>
          <ul className="space-y-px">
            {groupe.entrees.map((e) => {
              const IconeEntree = Icone[e.icone]
              const actif = chemin === e.href || chemin.startsWith(`${e.href}/`)

              if (e.aVenir === true) {
                return (
                  <li key={e.libelle}>
                    <span
                      aria-disabled
                      title="Ecran prevu dans un sprint ulterieur"
                      className="text-muted-foreground/45 flex items-center gap-2.5 rounded-lg px-3 py-[0.4375rem] text-sm"
                    >
                      <IconeEntree className="size-[1.0625rem] shrink-0" strokeWidth={1.75} />
                      {e.libelle}
                    </span>
                  </li>
                )
              }

              return (
                <li key={e.href} className="relative">
                  {/* Repere d etat actif sur le bord, plutot qu un aplat seul :
                      il reste lisible en contraste force et a l impression. */}
                  {actif && (
                    <span
                      aria-hidden
                      className="bg-foreground absolute top-1/2 left-0 h-4 w-0.5 -translate-y-1/2 rounded-r-full"
                    />
                  )}
                  <Link
                    href={e.href}
                    aria-current={actif ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-[0.4375rem] text-sm transition-colors duration-150',
                      actif
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-accent/55 hover:text-foreground',
                    )}
                  >
                    <IconeEntree
                      className="size-[1.0625rem] shrink-0"
                      strokeWidth={actif ? 2 : 1.75}
                    />
                    {e.libelle}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
