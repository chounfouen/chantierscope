'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { Icone, type NomIcone } from '@/lib/icones'
import { cn } from '@/lib/utils'

export type Entree = {
  libelle: string
  href: string
  icone: NomIcone
  /** Ecran pas encore livre : visible mais inactif, pour situer la suite. */
  aVenir?: boolean
  /**
   * Prechargement complet de l'ecran des que le lien est visible, donnees et
   * code compris. Sans lui, le code des composants clients n'est connu qu'a
   * l'arrivee de la page, et React retient l'affichage le temps de le
   * charger : trois cents millisecondes de plus a chaque navigation. Reserve
   * aux ecrans legers : le journal, lourd, et les photos, dont chaque
   * prechargement signerait des dizaines d'adresses, gardent le
   * prechargement partiel par defaut.
   */
  prechargement?: 'complet'
}

export type Groupe = { titre: string; entrees: readonly Entree[] }

export function Navigation({ groupes }: { groupes: readonly Groupe[] }) {
  const chemin = usePathname()
  // L'entree active est la plus specifique : le tableau de bord, a la
  // racine du projet, est le prefixe de tous les autres ecrans.
  const correspond = (href: string) => chemin === href || chemin.startsWith(`${href}/`)
  const hrefActif = groupes
    .flatMap((g) => g.entrees)
    .filter((e) => e.aVenir !== true && correspond(e.href))
    .reduce<string | null>((m, e) => (m === null || e.href.length > m.length ? e.href : m), null)

  return (
    <nav aria-label="Navigation principale" className="space-y-6">
      {groupes.map((groupe) => (
        <div key={groupe.titre}>
          <p className="text-muted-foreground mb-1.5 px-3 text-[0.6875rem] font-medium tracking-wider uppercase">
            {groupe.titre}
          </p>
          <ul className="space-y-px">
            {groupe.entrees.map((e) => {
              const IconeEntree = Icone[e.icone]
              const actif = e.href === hrefActif

              if (e.aVenir === true) {
                return (
                  <li key={e.libelle}>
                    <span
                      aria-disabled
                      title="Écran prévu dans un sprint ultérieur"
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
                    prefetch={e.prechargement === 'complet' ? true : 'auto'}
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
                    <Attente />
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

/**
 * Retour discret pendant le chargement d'un ecran.
 *
 * Il n'y a pas de squelette de chargement commun aux ecrans du projet : React
 * retient l'affichage d'un contenu au moins trois cents millisecondes apres
 * son squelette, ce qui ralentissait toutes les navigations, meme rapides.
 * Le lien clique porte a la place un point qui pulse, n'apparaissant qu'apres
 * cent cinquante millisecondes : une navigation rapide ne clignote pas.
 */
function Attente() {
  const { pending } = useLinkStatus()
  return (
    <span
      aria-hidden
      className={cn(
        'bg-foreground/60 ml-auto size-1.5 shrink-0 rounded-full opacity-0',
        pending && 'animate-pulse opacity-100 transition-opacity delay-150',
      )}
    />
  )
}
