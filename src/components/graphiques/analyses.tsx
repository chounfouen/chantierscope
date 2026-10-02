'use client'

/**
 * Graphiques de l'ecran d'analyses.
 *
 * Regles communes, celles de la palette validee :
 *
 * - un seul axe des ordonnees par graphique ; deux grandeurs d'unites
 *   differentes font deux graphiques ;
 * - une serie prend le premier emplacement de la palette, deux series les
 *   deux premiers, dans cet ordre, toujours ;
 * - une legende des deux series ; aucune pour une serie seule, que le titre
 *   nomme ;
 * - les textes restent a l'encre, jamais a la couleur d'une serie ;
 * - chaque graphique offre ses donnees en tableau, et une infobulle au
 *   survol.
 */

import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { dateCourte, dateLongue, moisCourt, nombre, pourcent } from '@/lib/format'
import { CHROME, MARQUE, SERIES } from '@/lib/viz'

const AXE = { fill: CHROME.encreDiscrete, fontSize: 11 }

/* -------------------------------------------------------------------------- */
/* Pieces communes                                                            */
/* -------------------------------------------------------------------------- */

export type SerieLegende = { libelle: string; couleur: string; forme: 'trait' | 'barre' }

export function Legende({ series }: { series: readonly SerieLegende[] }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
      {series.map((s) => (
        <span key={s.libelle} className="text-muted-foreground flex items-center gap-1.5">
          <span
            aria-hidden
            className={s.forme === 'trait' ? 'h-0.5 w-4 rounded-full' : 'h-2.5 w-2.5 rounded-sm'}
            style={{ background: s.couleur }}
          />
          {s.libelle}
        </span>
      ))}
    </p>
  )
}

/** Vue tableau d'un graphique : les memes donnees, lisibles sans couleur. */
export function VueTableau({
  titre,
  colonnes,
  lignes,
}: {
  titre: string
  colonnes: readonly string[]
  lignes: readonly (readonly ReactNode[])[]
}) {
  return (
    <details className="mt-3 text-xs">
      <summary className="text-muted-foreground cursor-pointer select-none">
        Voir les données en tableau
      </summary>
      <div className="mt-2 max-h-72 overflow-auto">
        <table className="chiffres-alignes w-full border-collapse">
          <caption className="sr-only">{titre}</caption>
          <thead className="bg-card sticky top-0">
            <tr className="border-border border-b">
              {colonnes.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`text-muted-foreground px-2 py-1.5 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, k) => (
              <tr key={k} className="border-border/50 border-b last:border-0">
                {l.map((v, i) => (
                  <td key={i} className={`px-2 py-1 ${i === 0 ? 'text-left' : 'text-right'}`}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

type Charge = { dataKey?: string | number; name?: string; value?: number | null; color?: string }

function Infobulle({
  active,
  payload,
  titre,
  format,
}: {
  active?: boolean
  payload?: readonly Charge[]
  titre: string
  format: (v: number, cle: string) => string
}) {
  if (active !== true || !payload || payload.length === 0) return null
  return (
    <div className="bg-popover text-popover-foreground border-border/80 rounded-lg border px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium">{titre}</p>
      <dl className="chiffres-alignes space-y-0.5">
        {payload
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => (
            <div key={String(p.dataKey)} className="flex items-center justify-between gap-6">
              <dt className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                <span className="text-muted-foreground">{p.name}</span>
              </dt>
              <dd className="font-medium">{format(p.value as number, String(p.dataKey))}</dd>
            </div>
          ))}
      </dl>
    </div>
  )
}

/** Une graduation par mois. */
function graduationsMensuelles(dates: readonly string[]): string[] {
  return dates.filter((d, i) => i === 0 || d.slice(5, 7) !== dates[i - 1]?.slice(5, 7))
}

/* -------------------------------------------------------------------------- */
/* Effectifs                                                                  */
/* -------------------------------------------------------------------------- */

export type PointEffectifDate = { date: string; reel: number | null; prevu: number }

/**
 * Histogramme des ouvriers releves, courbe de la charge prevue superposee.
 * Une seule unite, l'ouvrier : un seul axe.
 */
export function HistogrammeEffectifs({
  points,
  dateAnalyse,
}: {
  points: readonly PointEffectifDate[]
  dateAnalyse: string
}) {
  const series: SerieLegende[] = [
    { libelle: 'Ouvriers relevés', couleur: SERIES[0], forme: 'barre' },
    { libelle: 'Charge prévue au planning', couleur: SERIES[1], forme: 'trait' },
  ]
  return (
    <figure className="m-0">
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={[...points]}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            barCategoryGap={1}
          >
            <CartesianGrid stroke={CHROME.grille} strokeWidth={MARQUE.hairline} vertical={false} />
            <XAxis
              dataKey="date"
              ticks={graduationsMensuelles(points.map((p) => p.date))}
              tickFormatter={moisCourt}
              tick={AXE}
              tickLine={false}
              axisLine={{ stroke: CHROME.ligneBase }}
            />
            <YAxis tick={AXE} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
            <ReferenceLine
              x={dateAnalyse}
              stroke={CHROME.ligneBase}
              strokeWidth={MARQUE.hairline}
            />
            <Tooltip
              cursor={{ fill: CHROME.grille, opacity: 0.5 }}
              content={({ active, payload, label }) => (
                <Infobulle
                  active={active}
                  payload={payload as unknown as readonly Charge[]}
                  titre={typeof label === 'string' ? dateLongue(label) : ''}
                  format={(v) => `${nombre(v)} ouvriers`}
                />
              )}
            />
            <Bar
              dataKey="reel"
              name={series[0]!.libelle}
              fill={SERIES[0]}
              isAnimationActive={false}
            />
            <Line
              dataKey="prevu"
              name={series[1]!.libelle}
              type="stepAfter"
              stroke={SERIES[1]}
              strokeWidth={MARQUE.trait}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legende series={series} />
      <VueTableau
        titre="Effectifs jour par jour"
        colonnes={['Date', 'Ouvriers relevés', 'Charge prévue']}
        lignes={points.map((p) => [
          dateCourte(p.date),
          p.reel === null ? '—' : nombre(p.reel),
          nombre(p.prevu),
        ])}
      />
    </figure>
  )
}

/* -------------------------------------------------------------------------- */
/* Materiaux                                                                  */
/* -------------------------------------------------------------------------- */

export type PointMateriauDate = { date: string; prevu: number; realise: number }

/** Consommation cumulee d'un materiau, prevu contre realise, dans son unite. */
export function ConsommationMateriau({
  libelle,
  unite,
  total,
  points,
}: {
  libelle: string
  unite: string
  total: number
  points: readonly PointMateriauDate[]
}) {
  const series: SerieLegende[] = [
    { libelle: 'Prévu', couleur: SERIES[0], forme: 'trait' },
    { libelle: 'Réalisé', couleur: SERIES[1], forme: 'trait' },
  ]
  const decimales = unite === 't' ? 1 : 0
  const dernier = points[points.length - 1]
  // Une ligne par semaine dans le tableau : deux cents lignes ne se lisent pas.
  const hebdo = points.filter((_, i) => i % 7 === 0 || i === points.length - 1)
  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {libelle}, en {unite}
        </span>
        {dernier !== undefined && (
          <span className="text-muted-foreground chiffres-alignes text-xs">
            {nombre(dernier.realise, decimales)} / {nombre(total, decimales)} {unite}
          </span>
        )}
      </figcaption>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...points]} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHROME.grille} strokeWidth={MARQUE.hairline} vertical={false} />
            <XAxis
              dataKey="date"
              ticks={graduationsMensuelles(points.map((p) => p.date))}
              tickFormatter={moisCourt}
              tick={AXE}
              tickLine={false}
              axisLine={{ stroke: CHROME.ligneBase }}
              minTickGap={16}
            />
            <YAxis
              tick={AXE}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => nombre(v)}
            />
            <Tooltip
              cursor={{ stroke: CHROME.ligneBase, strokeWidth: 1 }}
              content={({ active, payload, label }) => (
                <Infobulle
                  active={active}
                  payload={payload as unknown as readonly Charge[]}
                  titre={typeof label === 'string' ? dateLongue(label) : ''}
                  format={(v) => `${nombre(v, decimales)} ${unite}`}
                />
              )}
            />
            {(['prevu', 'realise'] as const).map((cle, i) => (
              <Line
                key={cle}
                dataKey={cle}
                name={series[i]!.libelle}
                type="monotone"
                stroke={SERIES[i]}
                strokeWidth={MARQUE.trait}
                dot={false}
                activeDot={{ r: MARQUE.point, strokeWidth: 2, stroke: 'var(--card)' }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legende series={series} />
      <VueTableau
        titre={`${libelle}, consommation cumulée`}
        colonnes={['Date', `Prévu (${unite})`, `Réalisé (${unite})`]}
        lignes={hebdo.map((p) => [
          dateCourte(p.date),
          nombre(p.prevu, decimales),
          nombre(p.realise, decimales),
        ])}
      />
    </figure>
  )
}

/* -------------------------------------------------------------------------- */
/* Barres horizontales a une serie                                            */
/* -------------------------------------------------------------------------- */

export type Barre = { libelle: string; valeur: number; detail?: string }

/**
 * Formats des valeurs, nommes : une fonction ne traverse pas la frontiere
 * entre composant serveur et composant client.
 */
export type FormatBarre = 'nombre' | 'pourcent'
const FORMATS: Record<FormatBarre, (v: number) => string> = {
  nombre: (v) => nombre(v),
  pourcent: (v) => pourcent(v, 0),
}

/**
 * Barres horizontales d'une seule serie, etiquetees directement. Sert aux
 * rendements, aux aleas par type et aux arrets par cause. Une reference
 * verticale optionnelle marque la valeur nominale.
 */
export function BarresHorizontales({
  barres,
  format: formatNomme,
  reference,
  libelleReference,
  colonnes,
  lignesTableau,
  titre,
}: {
  barres: readonly Barre[]
  format: FormatBarre
  reference?: number
  libelleReference?: string
  colonnes: readonly string[]
  lignesTableau: readonly (readonly ReactNode[])[]
  titre: string
}) {
  const format = FORMATS[formatNomme]
  const hauteur = Math.max(120, barres.length * 34 + 24)
  return (
    <figure className="m-0">
      <div className="w-full" style={{ height: hauteur }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...barres]}
            layout="vertical"
            margin={{ top: reference === undefined ? 4 : 20, right: 56, bottom: 4, left: 0 }}
            barCategoryGap={8}
          >
            <CartesianGrid
              stroke={CHROME.grille}
              strokeWidth={MARQUE.hairline}
              horizontal={false}
            />
            <XAxis
              type="number"
              tick={AXE}
              tickLine={false}
              axisLine={false}
              tickFormatter={format}
            />
            <YAxis
              type="category"
              dataKey="libelle"
              tick={{ ...AXE, fill: CHROME.encreSecondaire }}
              tickLine={false}
              axisLine={{ stroke: CHROME.ligneBase }}
              width={168}
            />
            {reference !== undefined && (
              <ReferenceLine
                x={reference}
                stroke={CHROME.encreSecondaire}
                strokeDasharray="3 3"
                label={{
                  value: libelleReference ?? '',
                  position: 'top',
                  fill: CHROME.encreDiscrete,
                  fontSize: 11,
                }}
              />
            )}
            <Tooltip
              cursor={{ fill: CHROME.grille, opacity: 0.5 }}
              content={({ active, payload, label }) => {
                const b = (payload?.[0] as { payload?: Barre } | undefined)?.payload
                return (
                  <Infobulle
                    active={active}
                    payload={payload as unknown as readonly Charge[]}
                    titre={String(label ?? '')}
                    format={(v) => (b?.detail ? `${format(v)}, ${b.detail}` : format(v))}
                  />
                )
              }}
            />
            <Bar
              dataKey="valeur"
              name={titre}
              fill={SERIES[0]}
              radius={[0, MARQUE.arrondi, MARQUE.arrondi, 0]}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="valeur"
                position="right"
                formatter={(v) => format(Number(v))}
                style={{ fill: CHROME.encrePrimaire, fontSize: 11 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <VueTableau titre={titre} colonnes={colonnes} lignes={lignesTableau} />
    </figure>
  )
}

/* -------------------------------------------------------------------------- */
/* Jours perdus                                                               */
/* -------------------------------------------------------------------------- */

/** Jours perdus cumules par les aleas, en escalier : un alea est un saut. */
export function JoursPerdus({ points }: { points: readonly { date: string; cumul: number }[] }) {
  const sauts = points.filter((p, i) => i === 0 || p.cumul !== points[i - 1]?.cumul)
  return (
    <figure className="m-0">
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={[...points]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={CHROME.grille} strokeWidth={MARQUE.hairline} vertical={false} />
            <XAxis
              dataKey="date"
              ticks={graduationsMensuelles(points.map((p) => p.date))}
              tickFormatter={moisCourt}
              tick={AXE}
              tickLine={false}
              axisLine={{ stroke: CHROME.ligneBase }}
              minTickGap={16}
            />
            <YAxis tick={AXE} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: CHROME.ligneBase, strokeWidth: 1 }}
              content={({ active, payload, label }) => (
                <Infobulle
                  active={active}
                  payload={payload as unknown as readonly Charge[]}
                  titre={typeof label === 'string' ? dateLongue(label) : ''}
                  format={(v) => `${nombre(v)} jours`}
                />
              )}
            />
            <Line
              dataKey="cumul"
              name="Jours perdus cumulés"
              type="stepAfter"
              stroke={SERIES[0]}
              strokeWidth={MARQUE.trait}
              dot={false}
              activeDot={{ r: MARQUE.point, strokeWidth: 2, stroke: 'var(--card)' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <VueTableau
        titre="Jours perdus cumulés"
        colonnes={['Date', 'Jours perdus cumulés']}
        lignes={sauts.map((p) => [dateCourte(p.date), nombre(p.cumul)])}
      />
    </figure>
  )
}
