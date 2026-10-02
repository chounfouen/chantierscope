'use client'

/**
 * Etat du reseau vu par le navigateur, en abonnement React.
 *
 * `navigator.onLine` ne garantit pas que le serveur soit joignable : un
 * telephone accroche a un relais sans liaison montante se dit en ligne. Il
 * ne sert donc qu'a eviter des tentatives vouees a l'echec et a declencher la
 * synchronisation ; c'est la reponse du serveur qui fait foi.
 */

import { useSyncExternalStore } from 'react'

function abonner(rappel: () => void): () => void {
  window.addEventListener('online', rappel)
  window.addEventListener('offline', rappel)
  return () => {
    window.removeEventListener('online', rappel)
    window.removeEventListener('offline', rappel)
  }
}

export function useEnLigne(): boolean {
  return useSyncExternalStore(
    abonner,
    () => navigator.onLine,
    // Au rendu serveur, on suppose le reseau present.
    () => true,
  )
}
