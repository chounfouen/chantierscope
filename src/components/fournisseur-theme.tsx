'use client'

/**
 * Theme de l'application, sans bibliotheque : la classe `dark` est posee
 * avant le premier affichage par le script de la mise en page racine, puis
 * tenue a jour ici quand l'utilisateur change de theme ou que le systeme
 * change le sien.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CLE_THEME, type Theme, type ThemeResolu } from '@/lib/theme'

type ContexteTheme = {
  theme: Theme
  resolvedTheme: ThemeResolu
  setTheme: (t: Theme) => void
}

const Contexte = createContext<ContexteTheme | null>(null)

const REQUETE_SOMBRE = '(prefers-color-scheme: dark)'

/** Choix de la session, pour un navigateur sans stockage local (navigation privee). */
let choixSession: Theme = 'system'

function lireChoix(): Theme {
  try {
    const t = localStorage.getItem(CLE_THEME)
    return t === 'light' || t === 'dark' || t === 'system' ? t : choixSession
  } catch {
    return choixSession
  }
}

function appliquer(resolu: ThemeResolu) {
  const e = document.documentElement
  // Pas de transition pendant la bascule : les couleurs changent d'un coup,
  // au lieu de s'animer chacune a sa vitesse.
  const gel = document.createElement('style')
  gel.textContent = '*,*::before,*::after{transition:none!important}'
  document.head.appendChild(gel)
  e.classList.toggle('dark', resolu === 'dark')
  e.style.colorScheme = resolu
  void getComputedStyle(document.body).opacity
  requestAnimationFrame(() => gel.remove())
}

/** Abonnes au choix de theme : changement local, autre onglet, systeme. */
const abonnes = new Set<() => void>()

function sAbonner(rappel: () => void): () => void {
  abonnes.add(rappel)
  const m = matchMedia(REQUETE_SOMBRE)
  m.addEventListener('change', rappel)
  window.addEventListener('storage', rappel)
  return () => {
    abonnes.delete(rappel)
    m.removeEventListener('change', rappel)
    window.removeEventListener('storage', rappel)
  }
}

const systemeSombreActuel = () => matchMedia(REQUETE_SOMBRE).matches

export function FournisseurTheme({ children }: { children: React.ReactNode }) {
  // Le serveur ne connait pas le choix : il rend « systeme », le navigateur
  // corrige aussitot apres l'hydratation, sans ecart entre les deux rendus.
  const theme = useSyncExternalStore(sAbonner, lireChoix, () => 'system' as const)
  const systemeSombre = useSyncExternalStore(sAbonner, systemeSombreActuel, () => false)

  const resolvedTheme: ThemeResolu = theme === 'system' ? (systemeSombre ? 'dark' : 'light') : theme

  useEffect(() => {
    if (document.documentElement.classList.contains('dark') !== (resolvedTheme === 'dark')) {
      appliquer(resolvedTheme)
    }
  }, [resolvedTheme])

  const setTheme = useCallback((t: Theme) => {
    choixSession = t
    try {
      localStorage.setItem(CLE_THEME, t)
    } catch {
      // Stockage indisponible : le choix vaut pour la session seulement.
    }
    for (const rappel of abonnes) rappel()
  }, [])

  const valeur = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return (
    <Contexte.Provider value={valeur}>
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </Contexte.Provider>
  )
}

export function useTheme(): ContexteTheme {
  const c = useContext(Contexte)
  if (!c) throw new Error('useTheme hors de FournisseurTheme.')
  return c
}
