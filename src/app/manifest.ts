import type { MetadataRoute } from 'next'
import { TEINTES_SYSTEME } from '@/lib/viz'

/**
 * Manifeste de l'application installable.
 *
 * Installee sur l'ecran d'accueil, l'application s'ouvre sans barre
 * d'adresse, comme une application native, et le navigateur traite ses
 * donnees locales comme celles d'une application : la file des releves
 * saisis hors ligne n'est plus effacee au bout de sept jours d'inactivite,
 * comme Safari le fait pour un simple site.
 *
 * Les teintes viennent de `TEINTES_SYSTEME` : le manifeste ne lit pas de
 * variable CSS.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ChantierScope',
    short_name: 'ChantierScope',
    description: 'Suivi de chantier : saisie journalière, planning, valeur acquise.',
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: TEINTES_SYSTEME.fondClair,
    theme_color: TEINTES_SYSTEME.soleil,
    icons: [
      { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icones/icone-masquable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [{ name: 'Saisie du jour', short_name: 'Saisie', url: '/?ecran=saisie' }],
  }
}
