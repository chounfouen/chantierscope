'use client'

import { useEffect } from 'react'

/**
 * Inscription du service worker. Desactivee en developpement : un cache de
 * pages masquerait les modifications du code a chaque rechargement.
 */
export function EnregistrementServiceWorker({ actif }: { actif: boolean }) {
  useEffect(() => {
    if (!actif || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Sans service worker, l'application fonctionne, seulement pas hors ligne.
    })
  }, [actif])
  return null
}
