'use client'

/**
 * Chiffres et anneau animes a l'affichage.
 *
 * Le mouvement attire l'oeil sur ce qui compte et rend l'arrivee sur l'ecran
 * vivante, sans rien retirer a l'exactitude : la valeur finale est celle du
 * serveur, et c'est elle que lisent les lecteurs d'ecran et l'impression.
 * Quand le systeme demande un mouvement reduit, la valeur s'affiche
 * directement.
 */

import { useEffect, useRef, useState } from 'react'
import { indice, nombre, pourcent } from '@/lib/format'
import { CHROME, SERIES } from '@/lib/viz'

/** Formats nommes : une fonction ne traverse pas la frontiere serveur-client. */
export type FormatCompteur = 'pourcent' | 'indice' | 'jours' | 'nombre'

function formater(v: number, f: FormatCompteur): string {
  switch (f) {
    case 'pourcent':
      return pourcent(v)
    case 'indice':
      return indice(v)
    case 'jours': {
      const j = Math.round(v)
      return `${j > 0 ? '+' : ''}${nombre(j)} j`
    }
    case 'nombre':
      return nombre(v)
  }
}

const reduit = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Interpolation de 0 a 1 sur la duree, avec un ralenti en fin de course. */
function useProgression(duree = 900): number {
  const [t, setT] = useState(0)
  const debut = useRef<number | null>(null)
  useEffect(() => {
    if (reduit()) {
      const id = requestAnimationFrame(() => setT(1))
      return () => cancelAnimationFrame(id)
    }
    let id = 0
    const pas = (maintenant: number) => {
      debut.current ??= maintenant
      const x = Math.min(1, (maintenant - debut.current) / duree)
      setT(1 - (1 - x) ** 3)
      if (x < 1) id = requestAnimationFrame(pas)
    }
    id = requestAnimationFrame(pas)
    return () => cancelAnimationFrame(id)
  }, [duree])
  return t
}

export function Compteur({ valeur, format }: { valeur: number; format: FormatCompteur }) {
  const t = useProgression()
  return (
    <>
      <span aria-hidden>{formater(valeur * t, format)}</span>
      <span className="sr-only">{formater(valeur, format)}</span>
    </>
  )
}

/**
 * Anneau d'avancement : le realise en teinte pleine, un repere pour le prevu.
 *
 * Une seule serie, donc le premier emplacement de la palette ; le repere du
 * prevu est a l'encre, comme toute annotation.
 */
export function AnneauProgression({
  realise,
  prevu,
  taille = 168,
}: {
  realise: number
  prevu: number
  taille?: number
}) {
  const t = useProgression(1100)
  const epaisseur = 16
  const r = (taille - epaisseur) / 2
  const c = 2 * Math.PI * r
  const angle = (f: number) => Math.min(1, Math.max(0, f)) * 2 * Math.PI - Math.PI / 2
  const repere = angle(prevu)
  const centre = taille / 2
  return (
    <div
      className="relative shrink-0"
      style={{ width: taille, height: taille }}
      role="img"
      aria-label={`${pourcent(realise)} réalisés pour ${pourcent(prevu)} prévus`}
    >
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} aria-hidden>
        <circle
          cx={centre}
          cy={centre}
          r={r}
          fill="none"
          stroke={CHROME.grille}
          strokeWidth={epaisseur}
        />
        <circle
          cx={centre}
          cy={centre}
          r={r}
          fill="none"
          stroke={SERIES[0]}
          strokeWidth={epaisseur}
          strokeLinecap="round"
          strokeDasharray={`${c * Math.min(1, realise) * t} ${c}`}
          transform={`rotate(-90 ${centre} ${centre})`}
        />
        {/* Repere du prevu : un trait radial a l'encre, detache par un liseré. */}
        <line
          x1={centre + (r - epaisseur / 2 - 3) * Math.cos(repere)}
          y1={centre + (r - epaisseur / 2 - 3) * Math.sin(repere)}
          x2={centre + (r + epaisseur / 2 + 3) * Math.cos(repere)}
          y2={centre + (r + epaisseur / 2 + 3) * Math.sin(repere)}
          stroke="var(--card)"
          strokeWidth={6}
          strokeLinecap="round"
        />
        <line
          x1={centre + (r - epaisseur / 2 - 3) * Math.cos(repere)}
          y1={centre + (r - epaisseur / 2 - 3) * Math.sin(repere)}
          x2={centre + (r + epaisseur / 2 + 3) * Math.cos(repere)}
          y2={centre + (r + epaisseur / 2 + 3) * Math.sin(repere)}
          stroke={CHROME.encrePrimaire}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="chiffres-alignes text-[2rem] leading-none font-extrabold">
          {pourcent(realise * t)}
        </span>
        <span className="text-muted-foreground mt-1 text-xs font-semibold">réalisé</span>
      </div>
    </div>
  )
}
