'use client'

import { useSyncExternalStore } from 'react'
import { useTheme } from '@/components/fournisseur-theme'
import { Button } from '@/components/ui/button'
import { Icone } from '@/lib/icones'

const sansAbonnement = () => () => {}

/**
 * Le theme resolu n'est connu que dans le navigateur : le serveur rend
 * toujours le bouton neutre, et l'icone du theme n'apparait qu'une fois la
 * page montee. Sans cela, un utilisateur en theme sombre recevait un rendu
 * serveur different du rendu client, et React regenerait l'arbre.
 */
export function BasculeTheme() {
  const { resolvedTheme, setTheme } = useTheme()
  const monte = useSyncExternalStore(
    sansAbonnement,
    () => true,
    () => false,
  )
  const sombre = monte && resolvedTheme === 'dark'
  const IconeTheme = sombre ? Icone.themeClair : Icone.themeSombre

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={sombre ? 'Passer en thème clair' : 'Passer en thème sombre'}
      onClick={() => setTheme(sombre ? 'light' : 'dark')}
    >
      <IconeTheme className="size-4" />
    </Button>
  )
}
