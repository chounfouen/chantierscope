'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Rendu differe d'un graphique couteux.
 *
 * Au premier rendu, un emplacement de meme taille ; le graphique est dessine
 * a l'image suivante. L'ecran apparait donc des que ses textes sont prets,
 * sans attendre le dessin de centaines de marques, et la page ne saute pas.
 *
 * `useDeferredValue` ne conviendrait pas : une navigation du routeur est deja
 * une transition, dans laquelle React rend directement la valeur finale.
 */
export function Differe({ children, className }: { children: ReactNode; className: string }) {
  const [pret, setPret] = useState(false)
  useEffect(() => {
    const image = requestAnimationFrame(() => setPret(true))
    return () => cancelAnimationFrame(image)
  }, [])
  return pret ? (
    <>{children}</>
  ) : (
    <div className={`bg-muted/40 rounded-md ${className}`} aria-hidden />
  )
}
