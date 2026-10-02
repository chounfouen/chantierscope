'use client'

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dateLongue, fcfa, fcfaCompact, moisCourt } from '@/lib/format'
import { Differe } from '@/components/graphiques/differe'
import { CHROME, COURBE_S, MARQUE, TIRETS_PROJECTION } from '@/lib/viz'

export type PointCourbe = { date: string; vp: number; va: number; cr: number | null }

/** Point au-dela de la date d'analyse : planifie, puis projections. */
export type PointProjection = { date: string; vp: number | null; va: number; cr: number | null }

type Donnee = {
  date: string
  vp: number | null
  va: number | null
  cr: number | null
  vaProjetee: number | null
  crProjete: number | null
}

/**
 * Courbe en S.
 *
 * Trois series : valeur planifiee, valeur acquise, cout reel. Ce sont les
 * trois premiers emplacements de la palette, les seuls qui valident en mode
 * toutes paires dans les deux themes.
 *
 * L'apport principal de ce graphique n'est pas de montrer trois courbes, mais
 * de rendre LISIBLE l'ecart de delai : le segment horizontal trace depuis le
 * point de valeur acquise jusqu'a la courbe planifiee materialise le nombre
 * de jours de retard. C'est la seule lecture de la courbe en S qui donne un
 * retard en jours ; le SPI, lui, est un rapport sans unite, et confondre les
 * deux est une erreur classique.
 *
 * Au-dela de la date d'analyse, la valeur planifiee se prolonge en trait
 * plein — c'est le planning — et la valeur acquise et le cout reel se
 * prolongent en pointille : ce sont des projections, pas des constats. Le
 * pointille garde la teinte de sa serie, l'identite ne change pas.
 */
export function CourbeS({
  points,
  projection = [],
  bac,
  ecartDelaiJ,
  interne,
}: {
  points: readonly PointCourbe[]
  /** Points posterieurs a la date d'analyse, le premier etant cette date. */
  projection?: readonly PointProjection[]
  /** Budget a l'achevement, trace en reference horizontale. */
  bac: number
  /** Ecart de delai en jours, positif pour un retard. */
  ecartDelaiJ: number
  interne: boolean
}) {
  if (points.length === 0) return null

  const dernier = points[points.length - 1] as PointCourbe
  const indiceRattrapage = Math.max(0, points.length - 1 - Math.round(ecartDelaiJ))
  const rattrapage = points[indiceRattrapage] as PointCourbe
  const retard = Math.round(ecartDelaiJ)

  const donnees: Donnee[] = points.map((p) => ({
    ...p,
    vaProjetee: null,
    crProjete: null,
  }))
  const debutProjection = projection[0]
  if (debutProjection !== undefined) {
    // Le point du jour porte les deux traces, pour que le pointille parte de
    // la courbe constatee sans discontinuite.
    const jour = donnees[donnees.length - 1] as Donnee
    jour.vaProjetee = jour.va
    jour.crProjete = interne ? jour.cr : null
    for (const p of projection.slice(1)) {
      donnees.push({
        date: p.date,
        vp: p.vp,
        va: null,
        cr: null,
        vaProjetee: p.va,
        crProjete: interne ? p.cr : null,
      })
    }
  }
  const finProjetee = projection.length > 1 ? projection[projection.length - 1] : undefined

  /** Une graduation par mois, quelle que soit la duree affichee. */
  const graduations = donnees
    .filter((p, i) => i === 0 || p.date.slice(5, 7) !== (donnees[i - 1] as Donnee).date.slice(5, 7))
    .map((p) => p.date)

  const series = [
    { cle: 'vp' as const, ...COURBE_S.valeurPlanifiee },
    { cle: 'va' as const, ...COURBE_S.valeurAcquise },
    ...(interne ? [{ cle: 'cr' as const, ...COURBE_S.coutReel }] : []),
  ]

  return (
    <figure className="m-0">
      <div className="h-[21rem] w-full">
        <Differe className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={donnees} margin={{ top: 16, right: 20, bottom: 4, left: 4 }}>
              <CartesianGrid
                stroke={CHROME.grille}
                strokeWidth={MARQUE.hairline}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                ticks={graduations}
                tickFormatter={moisCourt}
                tick={{ fill: CHROME.encreDiscrete, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: CHROME.ligneBase }}
                minTickGap={8}
              />
              <YAxis
                tickFormatter={(v: number) => fcfaCompact(v)}
                tick={{ fill: CHROME.encreDiscrete, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={58}
              />

              {/* Budget a l achevement : la cible que la courbe planifiee rejoint. */}
              <ReferenceLine
                y={bac}
                stroke={CHROME.ligneBase}
                strokeDasharray="3 4"
                label={{
                  value: `Budget ${fcfaCompact(bac)}`,
                  position: 'insideTopLeft',
                  fill: CHROME.encreDiscrete,
                  fontSize: 11,
                }}
              />

              {/* Lecture horizontale de l ecart de delai.
                Le trait vertical marque la date a laquelle le planifie valait
                ce que le realise vaut aujourd hui ; le segment horizontal
                mesure l ecart, et porte sa valeur en clair. */}
              {retard > 0 && (
                <>
                  <ReferenceLine
                    x={rattrapage.date}
                    stroke={CHROME.grille}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                  />
                  <ReferenceLine
                    segment={[
                      { x: rattrapage.date, y: dernier.va },
                      { x: dernier.date, y: dernier.va },
                    ]}
                    stroke={CHROME.encreSecondaire}
                    strokeWidth={1.5}
                    label={{
                      value: `${retard} jours de retard`,
                      position: 'left',
                      fill: CHROME.encreSecondaire,
                      fontSize: 11,
                      fontWeight: 500,
                      offset: 10,
                    }}
                  />
                </>
              )}

              {finProjetee !== undefined && (
                <ReferenceLine
                  x={dernier.date}
                  stroke={CHROME.ligneBase}
                  strokeWidth={MARQUE.hairline}
                  label={{
                    value: 'Situation',
                    position: 'insideTopLeft',
                    fill: CHROME.encreDiscrete,
                    fontSize: 11,
                  }}
                />
              )}

              <Tooltip
                cursor={{ stroke: CHROME.ligneBase, strokeWidth: 1 }}
                content={<Infobulle />}
              />

              {series.map((s) => (
                <Line
                  key={s.cle}
                  type="monotone"
                  dataKey={s.cle}
                  name={s.libelle}
                  stroke={s.couleur}
                  strokeWidth={MARQUE.trait}
                  dot={false}
                  activeDot={{ r: MARQUE.point, strokeWidth: 2, stroke: 'var(--card)' }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
              {series
                .filter((s) => s.cle !== 'vp')
                .map((s) => (
                  <Line
                    key={`${s.cle}-projection`}
                    type="monotone"
                    dataKey={s.cle === 'va' ? 'vaProjetee' : 'crProjete'}
                    name={`${s.libelle}, projection`}
                    stroke={s.couleur}
                    strokeWidth={MARQUE.trait}
                    strokeDasharray={TIRETS_PROJECTION}
                    dot={false}
                    activeDot={{ r: MARQUE.point, strokeWidth: 2, stroke: 'var(--card)' }}
                    isAnimationActive={false}
                  />
                ))}
            </LineChart>
          </ResponsiveContainer>
        </Differe>
      </div>

      {/* Legende toujours presente : l identite ne repose jamais sur la seule
          couleur, et la valeur du jour est donnee en clair. */}
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs">
        {series.map((s) => (
          <span key={s.cle} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0.5 w-4 shrink-0 rounded-full"
              style={{ background: s.couleur }}
            />
            <span className="text-muted-foreground">{s.libelle}</span>
            <span className="chiffres-alignes font-medium">
              {fcfaCompact(s.cle === 'cr' ? (dernier.cr ?? 0) : dernier[s.cle])}
            </span>
          </span>
        ))}
        {finProjetee !== undefined && (
          <span className="text-muted-foreground flex items-center gap-1.5">
            <svg width="16" height="2" aria-hidden className="shrink-0">
              <line
                x1="0"
                x2="16"
                y1="1"
                y2="1"
                stroke={CHROME.encreSecondaire}
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            </svg>
            Projection au rythme constaté, achèvement vers le {dateLongue(finProjetee.date)}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

type ProprietesInfobulle = {
  active?: boolean
  payload?: { dataKey: string; value: number; name: string; color: string }[]
  label?: string
}

function Infobulle({ active, payload, label }: ProprietesInfobulle) {
  if (active !== true || !payload || payload.length === 0 || label === undefined) return null

  const present = payload.filter((p) => p.value !== null && p.value !== undefined)
  // Le jour de la situation porte la valeur constatee et le depart de la
  // projection, egaux : on n'affiche que le constat.
  const affiches = present.filter(
    (p) =>
      !(p.dataKey === 'vaProjetee' && present.some((q) => q.dataKey === 'va')) &&
      !(p.dataKey === 'crProjete' && present.some((q) => q.dataKey === 'cr')),
  )
  const lire = (cle: string) => present.find((p) => p.dataKey === cle)?.value
  const vp = lire('vp')
  const va = lire('va') ?? lire('vaProjetee')
  const ecart = vp !== undefined && va !== undefined ? va - vp : null

  return (
    <div className="bg-popover text-popover-foreground border-border/80 rounded-lg border px-3 py-2 text-xs shadow-sm">
      <p className="mb-1.5 font-medium">{dateLongue(label)}</p>
      <dl className="chiffres-alignes space-y-0.5">
        {affiches.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-6">
            <dt className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-0.5 w-3 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              <span className="text-muted-foreground">{p.name}</span>
            </dt>
            <dd className="font-medium">{fcfa(p.value)}</dd>
          </div>
        ))}
        {ecart !== null && (
          <div className="border-border/60 mt-1 flex items-center justify-between gap-6 border-t pt-1">
            <dt className="text-muted-foreground">Écart de valeur</dt>
            <dd className="font-medium">
              {ecart >= 0 ? '+' : ''}
              {fcfa(ecart)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
