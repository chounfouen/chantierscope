'use client'

import { useState } from 'react'
import {
  datesDePrise,
  joursEntre,
  parDate,
  parPointDeVue,
  photoA,
  type PhotoTimeline,
} from '@/db/compute/photos'
import { dateCourte, dateLongue } from '@/lib/format'
import { Icone } from '@/lib/icones'

export type PhotoAffichee = PhotoTimeline & {
  url: string
  vignette: string
  largeur: number | null
  hauteur: number | null
}

type PointDeVue = { id: string; nom: string }

function PriseDeVue({ photo, className }: { photo: PhotoAffichee; className?: string }) {
  return (
    // Les URL sont signees et ephemeres, ou des planches statiques : le
    // composant d'image de Next, qui les mettrait en cache, n'apporte rien.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo.url}
      alt={photo.legende ?? `Prise de vue du ${dateLongue(photo.date)}`}
      width={photo.largeur ?? undefined}
      height={photo.hauteur ?? undefined}
      className={className}
      loading="lazy"
      draggable={false}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Comparateur a volet                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Deux prises du meme point de vue superposees ; le volet decouvre la plus
 * ancienne sur la gauche. Le volet est un curseur natif : il se manoeuvre au
 * clavier, au doigt et a la souris, et se lit par un lecteur d'ecran.
 */
export function Comparateur({ photos, nom }: { photos: readonly PhotoAffichee[]; nom: string }) {
  const [avantId, setAvantId] = useState(photos[0]?.id ?? '')
  const [apresId, setApresId] = useState(photos[photos.length - 1]?.id ?? '')
  const [volet, setVolet] = useState(50)
  const avant = photos.find((p) => p.id === avantId)
  const apres = photos.find((p) => p.id === apresId)
  if (!avant || !apres) return null

  const choix = (id: string, valeur: string, changer: (v: string) => void, libelle: string) => (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{libelle}</span>
      <select
        id={id}
        value={valeur}
        onChange={(e) => changer(e.target.value)}
        className="champ champ-compact w-auto"
      >
        {photos.map((p) => (
          <option key={p.id} value={p.id}>
            {dateCourte(p.date)}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <div role="group" aria-label={`Comparaison, ${nom}`} className="mt-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {choix('avant', avantId, setAvantId, 'Avant')}
        {choix('apres', apresId, setApresId, 'Après')}
        <span className="text-muted-foreground text-xs">
          {Math.abs(joursEntre(avant.date, apres.date))} jours d’écart
        </span>
      </div>
      <div className="bg-muted relative mt-2 overflow-hidden rounded-lg select-none">
        <PriseDeVue photo={apres} className="block h-auto w-full" />
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - volet}% 0 0)` }}
          aria-hidden
        >
          <PriseDeVue photo={avant} className="block h-auto w-full" />
        </div>
        <div
          aria-hidden
          className="bg-background absolute inset-y-0 w-0.5 shadow"
          style={{ left: `calc(${volet}% - 1px)` }}
        />
        <span className="bg-background/85 absolute bottom-2 left-2 rounded px-1.5 py-0.5 text-xs font-medium">
          {dateCourte(avant.date)}
        </span>
        <span className="bg-background/85 absolute right-2 bottom-2 rounded px-1.5 py-0.5 text-xs font-medium">
          {dateCourte(apres.date)}
        </span>
      </div>
      <label className="mt-2 flex items-center gap-3 text-xs">
        <span className="text-muted-foreground shrink-0">Position du volet</span>
        <input
          type="range"
          min={0}
          max={100}
          value={volet}
          onChange={(e) => setVolet(Number(e.target.value))}
          className="w-full"
          aria-valuetext={`${volet} % de la prise du ${dateLongue(avant.date)}`}
        />
      </label>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Timeline                                                                   */
/* -------------------------------------------------------------------------- */

export function Timeline({
  photos,
  pointsDeVue,
  vue,
}: {
  photos: readonly PhotoAffichee[]
  pointsDeVue: readonly PointDeVue[]
  vue: 'chronologie' | 'grille'
}) {
  const dates = datesDePrise(photos)
  const [rang, setRang] = useState(dates.length - 1)
  const [comparer, setComparer] = useState<string | null>(null)

  if (photos.length === 0) {
    return (
      <p className="surface text-muted-foreground mt-4 px-5 py-10 text-center text-sm">
        Aucune photo ne correspond à ces critères.
      </p>
    )
  }

  if (vue === 'grille') {
    return (
      <div className="mt-4 space-y-6">
        {parDate(photos).map((g) => (
          <section key={g.date} aria-label={dateLongue(g.date)}>
            <h2 className="mb-2.5 text-base font-extrabold">{dateLongue(g.date)}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {g.photos.map((p) => (
                <li key={p.id}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-visible:ring-ring block overflow-hidden rounded-lg focus-visible:ring-2"
                  >
                    <PriseDeVue
                      photo={{ ...p, url: p.vignette }}
                      className="aspect-[3/2] w-full object-cover"
                    />
                  </a>
                  <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                    {pointsDeVue.find((v) => v.id === p.pointDeVueId)?.nom ?? 'Sans point de vue'}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }

  const date = dates[Math.min(rang, dates.length - 1)] as string
  const groupes = parPointDeVue(
    photos,
    pointsDeVue.map((v) => v.id),
  )

  return (
    <div className="mt-4">
      <div className="surface px-5 py-4">
        <label className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="flex items-center gap-2 text-sm font-bold">
            <span className="pastille size-7">
              <Icone.calendrier className="size-3.5" strokeWidth={2.25} aria-hidden />
            </span>
            Curseur temporel
          </span>
          <input
            type="range"
            min={0}
            max={dates.length - 1}
            value={Math.min(rang, dates.length - 1)}
            onChange={(e) => setRang(Number(e.target.value))}
            className="min-w-48 flex-1"
            aria-valuetext={dateLongue(date)}
          />
          <span className="chiffres-alignes text-sm font-semibold">{dateLongue(date)}</span>
        </label>
        <p className="text-muted-foreground mt-1 text-xs">
          Chaque point de vue montre sa dernière prise à cette date. {dates.length} dates de prise
          de vue.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {groupes.map((g) => {
          const nom = pointsDeVue.find((v) => v.id === g.pointDeVueId)?.nom ?? 'Sans point de vue'
          const cle = g.pointDeVueId ?? 'aucun'
          const p = photoA(g.photos, date)
          return (
            <section key={cle} aria-label={nom} className="surface px-4 py-3.5">
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="text-base font-extrabold">{nom}</h2>
                <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-xs font-bold">
                  {g.photos.length} prises
                </span>
              </div>
              {comparer === cle && g.photos.length > 1 ? (
                <Comparateur photos={g.photos} nom={nom} />
              ) : p === null ? (
                <p className="bg-muted text-muted-foreground flex aspect-[3/2] items-center justify-center rounded-lg text-sm">
                  Pas encore de prise à cette date
                </p>
              ) : (
                <figure className="m-0">
                  <PriseDeVue photo={p} className="bg-muted block h-auto w-full rounded-lg" />
                  <figcaption className="text-muted-foreground mt-1.5 text-xs">
                    Prise du {dateLongue(p.date)}
                    {p.date !== date &&
                      `, ${joursEntre(p.date, date)} jours avant la date du curseur`}
                  </figcaption>
                </figure>
              )}
              {g.pointDeVueId !== null && g.photos.length > 1 && (
                <button
                  type="button"
                  onClick={() => setComparer(comparer === cle ? null : cle)}
                  aria-pressed={comparer === cle}
                  className="relief bg-card border-input mt-3 h-9 rounded-xl border-2 px-3 text-xs font-bold [--relief:var(--input)]"
                >
                  {comparer === cle ? 'Revenir au curseur' : 'Comparer deux dates'}
                </button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
