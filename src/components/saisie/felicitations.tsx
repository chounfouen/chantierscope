'use client'

/**
 * Felicitations apres l'envoi d'un releve.
 *
 * La touche ludique de l'application, volontairement unique : un releve
 * transmis chaque jour est exactement ce dont le suivi a besoin, et le chef
 * de chantier qui le fait merite qu'on le remarque. Une coche qui jaillit,
 * quelques pieces de couleur qui retombent, et la serie de journees.
 * Le mouvement s'efface quand le systeme demande un mouvement reduit.
 */

import Link from 'next/link'
import { useState } from 'react'
import { Icone } from '@/lib/icones'
import { SERIES } from '@/lib/viz'

/** Pieces de confettis : position, teinte, delai et rotation, fixes pour un rendu stable. */
const PIECES = Array.from({ length: 18 }, (_, i) => ({
  gauche: (i * 37) % 100,
  teinte: i % 3 === 0 ? 'var(--soleil)' : SERIES[i % 4],
  delai: (i % 6) * 70,
  rotation: (i * 47) % 360,
  rond: i % 4 === 0,
}))

export function Felicitations({
  prenom,
  serie,
  palier,
  journal,
  nouveau,
}: {
  prenom: string
  serie: number
  palier: number | null
  journal: string
  nouveau: string
}) {
  const [ouvert, setOuvert] = useState(true)
  if (!ouvert) return null
  return (
    <section
      aria-label="Relevé envoyé"
      role="status"
      className="surface entree relative mt-4 overflow-hidden px-6 py-6 text-center"
      style={{ background: 'linear-gradient(160deg, var(--soleil-doux), var(--card) 70%)' }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full">
        {PIECES.map((p, i) => (
          <span
            key={i}
            className="confetti absolute top-0 block h-3 w-2"
            style={{
              left: `${p.gauche}%`,
              background: p.teinte,
              animationDelay: `${p.delai}ms`,
              rotate: `${p.rotation}deg`,
              borderRadius: p.rond ? '999px' : '2px',
            }}
          />
        ))}
      </div>
      <span className="jaillir bg-etat-acheve relative mx-auto grid size-16 place-items-center rounded-full text-white shadow-[0_5px_0_color-mix(in_oklab,var(--etat-acheve),black_25%)]">
        <Icone.valide className="size-9" strokeWidth={2.5} aria-hidden />
      </span>
      <h2 className="relative mt-4 text-2xl font-extrabold">
        Relevé envoyé, merci {prenom}&nbsp;!
      </h2>
      <p className="text-muted-foreground relative mt-1 font-semibold">
        Le conducteur de travaux le validera ; il comptera alors dans l’avancement.
      </p>
      {serie > 0 && (
        <p className="bg-soleil text-soleil-encre relative mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1.5 font-extrabold">
          <Icone.calendrier className="size-4" strokeWidth={2.5} aria-hidden />
          {serie === 1 ? 'Premier jour de votre série' : `Série de ${serie} jours de relevés`}
        </p>
      )}
      {palier !== null && (
        <p className="relative mt-2 text-sm font-bold">
          Palier des {palier} jours atteint : le chantier est suivi sans un trou.
        </p>
      )}
      <div className="relative mt-5 flex flex-wrap justify-center gap-3">
        <Link
          href={nouveau}
          className="relief bg-primary text-primary-foreground inline-flex h-11 items-center gap-2 rounded-xl px-5 font-bold"
        >
          <Icone.ajouter className="size-4" strokeWidth={2.5} aria-hidden />
          Saisir un autre relevé
        </Link>
        <Link
          href={journal}
          className="relief border-input bg-card inline-flex h-11 items-center rounded-xl border-2 px-5 font-bold [--relief:var(--input)]"
        >
          Retour au journal
        </Link>
        <button
          type="button"
          onClick={() => setOuvert(false)}
          className="text-muted-foreground h-11 px-3 text-sm font-bold underline-offset-4 hover:underline"
        >
          Voir le relevé
        </button>
      </div>
    </section>
  )
}
