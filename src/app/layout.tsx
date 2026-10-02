import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { FournisseurTheme } from '@/components/fournisseur-theme'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const sans = Geist({ variable: '--font-sans', subsets: ['latin'] })
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

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
      <body className={`${sans.variable} ${mono.variable} antialiased`}>
        <FournisseurTheme>
          {children}
          <Toaster />
        </FournisseurTheme>
      </body>
    </html>
  )
}
