'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ETAT, type Etat } from '@/lib/etats'
import { dateCourte, dateLongue, pourcent } from '@/lib/format'
import { Icone } from '@/lib/icones'

/** Etat d'une zone ou d'une tache a un jour echantillonne : reel, prevu, etat. */
export type Releve3 = [number, number, Etat]

export type ZonePlan = {
  id: string
  nom: string
  niveau: number
  pathSvg: string
  tacheIds: string[]
  /** Un element par date du curseur. */
  serie: Releve3[]
}

export type TachePlanAffichee = {
  id: string
  codeWbs: string
  nom: string
  lotId: string
  dateDebutPrevue: string
  dateFinPrevue: string
  critique: boolean
  serie: Releve3[]
}

const LIBELLE_NIVEAU = (n: number) => (n === 0 ? 'Rez-de-chaussée' : `R+${n}`)
const ETATS_LEGENDE: Etat[] = ['NON_COMMENCE', 'EN_COURS', 'EN_RETARD', 'CRITIQUE', 'ACHEVE']

/** Centre approximatif d'un contour : moyenne des sommets du chemin. */
function centre(path: string): [number, number] {
  const n = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
  let x = 0
  let y = 0
  let k = 0
  for (let i = 0; i + 1 < n.length; i += 2) {
    x += n[i] as number
    y += n[i + 1] as number
    k++
  }
  return k === 0 ? [0, 0] : [x / k, y / k]
}

export function PlanInteractif({
  projetId,
  dates,
  zones,
  taches,
}: {
  projetId: string
  dates: string[]
  zones: ZonePlan[]
  taches: TachePlanAffichee[]
}) {
  const niveaux = [...new Set(zones.map((z) => z.niveau))].sort((a, b) => a - b)
  const [niveau, setNiveau] = useState(niveaux[0] ?? 0)
  const [rang, setRang] = useState(dates.length - 1)
  const [choisie, setChoisie] = useState<string | null>(null)
  const date = dates[rang] ?? ''
  const visibles = zones.filter((z) => z.niveau === niveau)
  const zone = zones.find((z) => z.id === choisie && z.niveau === niveau) ?? null

  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label="Plan de niveau" className="surface px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Niveau" className="bg-muted flex rounded-lg p-0.5 text-sm">
            {niveaux.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={n === niveau}
                onClick={() => {
                  setNiveau(n)
                  setChoisie(null)
                }}
                className={`rounded-md px-3 py-1 ${n === niveau ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground'}`}
              >
                {LIBELLE_NIVEAU(n)}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Cliquer une zone pour le détail de ses tâches
          </p>
        </div>

        <svg
          viewBox="0 0 440 280"
          className="mt-3 h-auto w-full"
          role="group"
          aria-label={`Plan du niveau ${LIBELLE_NIVEAU(niveau)} au ${dateLongue(date)}`}
        >
          {visibles.map((z) => {
            const [reel, , etat] = z.serie[rang] ?? [0, 0, 'NON_COMMENCE']
            const [cx, cy] = centre(z.pathSvg)
            const actif = z.id === choisie
            const nomCourt = z.nom.split('—')[1]?.trim() ?? z.nom
            return (
              <g
                key={z.id}
                role="button"
                tabIndex={0}
                aria-pressed={actif}
                aria-label={`${z.nom} : ${ETAT[etat].libelle}, ${pourcent(reel, 0)} réalisés`}
                onClick={() => setChoisie(actif ? null : z.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setChoisie(actif ? null : z.id)
                  }
                }}
                className="cursor-pointer outline-none [&:focus-visible>path]:stroke-[var(--encre-primaire)]"
                data-etat={etat}
              >
                <path
                  d={z.pathSvg}
                  fill={ETAT[etat].couleur}
                  fillOpacity={0.55}
                  stroke={actif ? 'var(--encre-primaire)' : 'var(--card)'}
                  strokeWidth={actif ? 3 : 2}
                />
                <text
                  x={cx}
                  y={cy - 4}
                  textAnchor="middle"
                  fontSize={12}
                  fill="var(--encre-primaire)"
                >
                  {nomCourt}
                </text>
                <text
                  x={cx}
                  y={cy + 13}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  fill="var(--encre-primaire)"
                >
                  {pourcent(reel, 0)}
                </text>
              </g>
            )
          })}
        </svg>

        <ul aria-label="Légende des états" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {ETATS_LEGENDE.map((e) => {
            const I = ETAT[e].icone
            return (
              <li
                key={e}
                className="text-muted-foreground flex items-center gap-1.5"
                title={ETAT[e].definition}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-sm"
                  style={{ background: ETAT[e].couleur, opacity: 0.8 }}
                />
                <I className="size-3.5" strokeWidth={1.75} aria-hidden />
                {ETAT[e].libelle}
              </li>
            )
          })}
        </ul>

        <label className="border-border/60 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Icone.calendrier
              className="text-muted-foreground size-4"
              strokeWidth={1.75}
              aria-hidden
            />
            Rejouer l’avancement
          </span>
          <input
            type="range"
            min={0}
            max={dates.length - 1}
            value={rang}
            onChange={(e) => setRang(Number(e.target.value))}
            className="min-w-48 flex-1"
            aria-valuetext={dateLongue(date)}
          />
          <span className="chiffres-alignes text-sm font-semibold">{dateCourte(date)}</span>
        </label>
      </section>

      <section
        aria-label="Détail de la zone"
        className="surface overflow-hidden"
        aria-live="polite"
      >
        {zone === null ? (
          <p className="text-muted-foreground px-5 py-8 text-sm">
            Aucune zone sélectionnée. Le plan montre {visibles.length} zones au niveau{' '}
            {LIBELLE_NIVEAU(niveau)}.
          </p>
        ) : (
          <>
            <div className="border-border/70 border-b px-5 py-3.5">
              <h2 className="text-sm font-medium">{zone.nom}</h2>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Au {dateLongue(date)} : {pourcent(zone.serie[rang]?.[0] ?? 0)} réalisés pour{' '}
                {pourcent(zone.serie[rang]?.[1] ?? 0)} prévus
              </p>
            </div>
            <ul className="divide-border/60 divide-y">
              {zone.tacheIds
                .map((id) => taches.find((t) => t.id === id))
                .filter((t): t is TachePlanAffichee => t !== undefined)
                .map((t) => {
                  const [reel, prevu, etat] = t.serie[rang] ?? [0, 0, 'NON_COMMENCE']
                  const I = ETAT[etat].icone
                  return (
                    <li key={t.id} className="px-5 py-3">
                      <Link
                        href={`/projet/${projetId}/lot/${t.lotId}`}
                        className="text-sm font-medium hover:underline"
                      >
                        <span className="text-muted-foreground mr-1.5 font-mono text-xs">
                          {t.codeWbs}
                        </span>
                        {t.nom}
                      </Link>
                      <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                        <span
                          className={`flex items-center gap-1 font-medium ${ETAT[etat].teinte}`}
                        >
                          <I className="size-3.5" strokeWidth={1.75} aria-hidden />
                          {ETAT[etat].libelle}
                        </span>
                        <span className="chiffres-alignes">
                          {pourcent(reel, 0)} réalisés, {pourcent(prevu, 0)} prévus
                        </span>
                        <span>
                          du {dateCourte(t.dateDebutPrevue)} au {dateCourte(t.dateFinPrevue)}
                        </span>
                        {t.critique && <span>chemin critique</span>}
                      </p>
                    </li>
                  )
                })}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
