import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
// Polices auto-hebergees : aucune requete vers un service tiers a
// l'execution, et un rendu identique hors ligne, sur le terrain.
import '@fontsource-variable/nunito'
import '@fontsource-variable/jetbrains-mono'
import { FournisseurTheme } from '@/components/fournisseur-theme'
import { Toaster } from '@/components/ui/sonner'
import { SCRIPT_THEME } from '@/lib/theme'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'ChantierScope',
    template: '%s — ChantierScope',
  },
  description:
    "Suivi de l'évolution d'un chantier de génie civil : avancement physique, planning et valeur acquise.",
}

export const viewport: Viewport = {
  // La saisie journaliere se fait au telephone, souvent a une main et en
  // plein soleil. Le zoom ne doit jamais etre bride.
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="antialiased">
        {/*
          Theme pose avant le premier affichage : voir src/lib/theme.ts.
          Quand une page echoue en developpement, Next reconstruit la mise en
          page dans le navigateur et React signale alors ce script : un
          avertissement de plus a cote de l'erreur reelle, sans effet.
        */}
        <Script id="theme" strategy="beforeInteractive">
          {SCRIPT_THEME}
        </Script>
        <FournisseurTheme>
          {children}
          <Toaster />
        </FournisseurTheme>
      </body>
    </html>
  )
}
